// What a line resolves to, shown beside it: variables' values, and each
// table's full name with the methods that build it and what chose them.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { annotationsIn, chosenText, generatedLenses } from "../src/annotations.js";
import type { ResolvedTable } from "@ingestron/definitions";
import { hoverAt } from "../src/hover.js";
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

  it("shows a file's code on one line, and says its language for the tooltip", () => {
    const project = openProject(retail, new Map());
    const text = read("transforms/daily_sales.yaml");
    const found = annotationsIn(project, "transforms/daily_sales.yaml", text, "dev");
    const line = text.split("\n").findIndex((item) => item.includes("${file:daily_sales.sql}"));
    const code = found.find((item) => item.line === line)!;
    expect(code.label).not.toContain("\n");
    expect(code.tooltip).toContain("\n");
    expect(code.language).toBe("sql");
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
    const minimal = join(import.meta.dirname, "../../cli/project-templates/minimal");
    const file = join(minimal, "flows/orders.yaml");
    const text = readFileSync(file, "utf8").replace(
      "source: shop\n",
      "source: shop\nstore: { uses: none }\n",
    );
    const project = openProject(minimal, new Map([[file, text]]));
    const found = annotationsIn(project, "flows/orders.yaml", text, "dev");
    const orders = found.find(
      (item) => item.line === text.split("\n").findIndex((line) => line.startsWith("  orders:")),
    );
    expect(orders?.tooltip).toMatch(
      /store: none, ends at the landed files, written in the definition \(flows\/orders\.yaml:\d+\)/,
    );
  });
});

describe("annotationsIn for tables that end at the landed files", () => {
  const landing = join(import.meta.dirname, "../../cli/test/fixtures/landing-only");
  const file =
    "abfss://landing@saleslakedev.dfs.core.windows.net/erp/erp.dbo.Customers/erp.dbo.Customers.parquet";

  it("shows where the files land, not a table that is never created", () => {
    const project = openProject(landing, new Map());
    const text = readFileSync(join(landing, "flows/erp.yaml"), "utf8");
    const found = annotationsIn(project, "flows/erp.yaml", text, "dev");
    const line = text.split("\n").findIndex((item) => item.startsWith("  customers:"));
    expect(found.find((item) => item.line === line)?.label).toBe(`→ ${file}`);
  });

  it("names the landed files in the table's hover too", () => {
    const project = openProject(landing, new Map());
    const text = readFileSync(join(landing, "flows/erp.yaml"), "utf8");
    const shown = hoverAt(project, "flows/erp.yaml", text, text.indexOf("customers:") + 2, "dev");
    expect(shown).toContain(`**\`customers\`** → \`${file}\``);
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

describe("chosenText", () => {
  it("explains the serve step too", () => {
    const step = (method: string) => ({
      method,
      pack: "test",
      settings: {},
      origins: {},
      chosenBy: { by: "standard-default" as const },
    });
    const table = { ingest: step("files"), store: step("stream"), serve: step("publish") };
    expect(chosenText(table as unknown as ResolvedTable)).toContain(
      "serve: publish, chosen by the standard's default",
    );
  });
});

describe("chosenText under runs-on", () => {
  it("says the environment's runs-on chose the landed method", () => {
    const table = {
      ingest: {
        method: "duckdb-landed",
        pack: "duckdb",
        settings: {},
        origins: {},
        chosenBy: { by: "runs-on" as const, pack: "duckdb" },
      },
    };
    expect(chosenText(table as unknown as ResolvedTable)).toBe(
      "ingest: duckdb-landed, chosen because the environment runs on duckdb",
    );
  });
});

describe("chosenText under runs-on, naming what it replaced", () => {
  it("says which method the landed method stands in for", () => {
    const table = {
      ingest: {
        method: "duckdb-landed",
        pack: "duckdb",
        settings: {},
        origins: {},
        chosenBy: { by: "runs-on" as const, pack: "duckdb", replaced: "adf-copy" },
      },
    };
    expect(chosenText(table as unknown as ResolvedTable)).toBe(
      "ingest: duckdb-landed, chosen because the environment runs on duckdb, in place of adf-copy",
    );
  });
});
