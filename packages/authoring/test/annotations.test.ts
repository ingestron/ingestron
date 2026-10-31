// What a line resolves to, shown beside it: variables' values, and each
// table's full name with the methods that build it and what chose them.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { annotationsIn, generatedLenses } from "../src/annotations.js";
import { openProject } from "../src/project.js";

const retail = join(import.meta.dirname, "../../cli/project-templates/retail");
const read = (file: string) => readFileSync(join(retail, file), "utf8");

describe("annotationsIn", () => {
  it("shows a variable's value for the environment", () => {
    const project = openProject(retail, new Map());
    const text = read("connections/shop.yaml");
    const line = text.split("\n").findIndex((item) => item.includes("${values.storage}"));
    const dev = annotationsIn(project, "connections/shop.yaml", text, "dev");
    expect(dev).toContainEqual(
      expect.objectContaining({
        line,
        label: "= abfss://landing@retaildev.dfs.core.windows.net/shop",
      }),
    );
    const prod = annotationsIn(project, "connections/shop.yaml", text, "prod");
    expect(prod[0]?.label).toContain("retailprod");
  });

  it("still shows values while another file has a problem", () => {
    const broken = new Map([
      [join(retail, "standard.yaml"), `${read("standard.yaml")}\nnaming: 3\n`],
    ]);
    const project = openProject(retail, broken);
    const text = read("connections/shop.yaml");
    expect(annotationsIn(project, "connections/shop.yaml", text, "prod")[0]?.label).toBe(
      "= abfss://landing@retailprod.dfs.core.windows.net/shop",
    );
  });

  it("still shows values while project.yaml itself has a YAML error", () => {
    const manifest = `${read("project.yaml")}\nbroken: {\n  values:\n`;
    const project = openProject(retail, new Map([[join(retail, "project.yaml"), manifest]]));
    const text = read("connections/shop.yaml");
    expect(annotationsIn(project, "connections/shop.yaml", text, "dev")[0]?.label).toBe(
      "= abfss://landing@retaildev.dfs.core.windows.net/shop",
    );
  });

  it("shows values in project.yaml too", () => {
    const project = openProject(retail, new Map());
    const text = `${read("project.yaml")}\n# ignored\n`.replace(
      "name: Retail sales",
      "name: Retail sales (${environment.name})",
    );
    const labels = annotationsIn(project, "project.yaml", text, "dev").map((item) => item.label);
    expect(labels).toContain("= Retail sales (dev)");
  });

  it("never shows a secret's or an environment variable's value", () => {
    const folder = join(import.meta.dirname, "../../cli/project-templates/private-sql-server");
    const project = openProject(folder, new Map());
    const text = readFileSync(join(folder, "connections/erp.yaml"), "utf8");
    const labels = annotationsIn(project, "connections/erp.yaml", text, undefined).map(
      (item) => item.label,
    );
    expect(text).toMatch(/\$\{secret:/);
    expect(labels.join("\n")).not.toMatch(/secret/i);
  });

  it("gives each flow table its full name, with how its methods were chosen", () => {
    const project = openProject(retail, new Map());
    const text = read("flows/shop.yaml");
    const found = annotationsIn(project, "flows/shop.yaml", text, "dev");
    const orders = found.filter((item) => item.line === text.split("\n").indexOf("  orders:"));
    expect(orders.map((item) => item.label)).toEqual(["→ dev_sales.bronze.orders"]);
    expect(orders[0]?.tooltip).toMatch(/ingest: files, chosen by the pack's default/);
  });

  it("says when a flow table ends at the landed files, and what chose that", () => {
    const text = read("flows/shop.yaml").replace(
      "source: shop\n",
      "source: shop\nstore: { uses: none }\n",
    );
    const project = openProject(retail, new Map([[join(retail, "flows/shop.yaml"), text]]));
    const found = annotationsIn(project, "flows/shop.yaml", text, "dev");
    const orders = found.find((item) => item.line === text.split("\n").indexOf("  orders:"));
    expect(orders?.tooltip).toMatch(
      /store: none, ends at the landed files, written in the definition \(flows\/shop\.yaml:\d+\)/,
    );
  });
});

describe("generatedLenses", () => {
  it("links each table to the files generated for it", () => {
    const project = openProject(retail, new Map());
    const text = read("flows/shop.yaml");
    const [orders] = generatedLenses(project, "flows/shop.yaml", text, "dev");
    expect(orders?.line).toBe(text.split("\n").indexOf("  orders:"));
    expect(orders?.methods).toBe("files → streaming-table");
    expect(orders?.chosen).toMatch(/store: streaming-table, chosen by the pack's default/);
    expect(orders?.files).toContain("build/dev/src/retail/bronze/orders.sql");
  });

  it("links a contract object to what is generated from it", () => {
    const project = openProject(retail, new Map());
    const text = read("contracts/orders.yaml");
    const lenses = generatedLenses(project, "contracts/orders.yaml", text, "dev");
    expect(lenses[0]?.files).toContain("build/dev/src/retail/bronze/orders.sql");
  });
});
