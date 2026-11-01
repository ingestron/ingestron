// The passport (spec/cli/passport.md): a plain page per data product, from the
// same run as the pipelines. Built on the retail starter with two products.
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fullNameText, loadDefinitions, type ResolvedModel } from "@ingestron/definitions";
import { describe, expect, it } from "vitest";
import { generatedOutputs } from "../src/generate.js";
import { packs } from "../src/packs.js";
import { passports } from "../src/passport.js";

const retail = join(import.meta.dirname, "../project-templates/retail");
const customers = `apiVersion: v1.1.0
kind: DataProduct
id: customers
name: Customers
status: active
description:
  purpose: Everyone who has bought from the web shop. Updated hourly.
team:
  members:
    - { username: mia@example.com, name: Mia Chen, role: owner }
support:
  - { channel: customer-data, url: "https://example.com/customer-data", tool: teams }
outputPorts:
  - { name: customers, contractId: shop.customers }
`;
const sales = `apiVersion: v1.1.0
kind: DataProduct
id: sales
name: Daily sales
status: active
description:
  purpose: Order totals per customer and day.
team:
  members:
    - { username: sam@example.com, role: owner }
inputPorts:
  - { name: customers, contractId: shop.customers }
outputPorts:
  - { name: daily_sales, contractId: shop.daily_sales, description: "a | b\\nc" }
`;
const governance = `governance:
  classification: { sensitive: [confidential] }
`;

/** The retail starter with the two products; `change` edits files after copying. */
function project(change: (folder: string) => void = () => {}): string {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-passport-"));
  cpSync(retail, folder, { recursive: true });
  writeFileSync(join(folder, "contracts/customers.product.yaml"), customers);
  writeFileSync(join(folder, "contracts/sales.product.yaml"), sales);
  const contract = join(folder, "contracts/customers.yaml");
  const text = readFileSync(contract, "utf8")
    .replace(
      "{ name: email, logicalType: string, required: true }",
      "{ name: email, logicalType: string, required: true, classification: confidential }",
    )
    .concat(
      "roles:\n  - { role: marketing-analysts, access: read, description: Campaign reporting, firstLevelApprovers: mia@example.com }\n",
    );
  writeFileSync(contract, text);
  writeFileSync(
    join(folder, "standard.yaml"),
    readFileSync(join(folder, "standard.yaml"), "utf8") + governance,
  );
  change(folder);
  return folder;
}

function model(folder: string, environment = "dev"): ResolvedModel {
  const result = loadDefinitions(folder, { packs, environment });
  expect(result.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
  return result.model!;
}

describe("passports", () => {
  it("writes no products folder for a project without products", () => {
    const plain = mkdtempSync(join(tmpdir(), "ingestron-passport-"));
    cpSync(retail, plain, { recursive: true });
    expect(generatedOutputs(model(plain), "dev").map(({ label }) => label)).toEqual(["dev"]);
  });

  it("names each output's table in this environment and where it lives", () => {
    const resolved = model(project());
    expect(generatedOutputs(resolved, "dev").map(({ label }) => label)).toEqual([
      "dev",
      "dev/products",
    ]);
    const table = resolved.tables.find((item) => item.name === "daily_sales")!;
    const page = passports(resolved)["sales.md"]!;
    expect(page).toContain(fullNameText(table.fullName));
    expect(page).toContain("Databricks");
  });

  it("marks sensitive columns and lists who may use them", () => {
    const page = passports(model(project()))["customers.md"]!;
    expect(page).toMatch(/\| email \|.*confidential \(sensitive\)/);
    expect(page).toContain("marketing-analysts");
  });

  it("escapes table cells", () => {
    expect(passports(model(project()))["sales.md"]).toContain("a \\| b c");
  });

  it("draws lineage with safe node ids", () => {
    const folder = project((root) => {
      const file = join(root, "connections/shop.yaml");
      writeFileSync(file, readFileSync(file, "utf8").replace("id: shop", "id: shop_db"));
      const flow = join(root, "flows/shop.yaml");
      writeFileSync(flow, readFileSync(flow, "utf8").replace("source: shop", "source: shop_db"));
    });
    const page = passports(model(folder))["sales.md"]!;
    expect(page).toMatch(/```mermaid\nflowchart LR\n/);
    const diagram = page.slice(page.indexOf("```mermaid"), page.lastIndexOf("```"));
    for (const id of diagram.matchAll(/(?:^|-->)\s*(\w[^\s[]*)\[/gm))
      expect(id[1]).toMatch(/^n\d+$/);
    expect(diagram).toContain('"shop_db (files)"');
  });

  it("says when an output is not built in this environment", () => {
    const folder = project((root) => {
      writeFileSync(
        join(root, "contracts/orphan.product.yaml"),
        sales
          .replace("id: sales", "id: orphan")
          .replace(/outputPorts:[\s\S]*$/, "outputPorts: []\n"),
      );
    });
    const resolved = model(folder);
    const product = resolved.products.find((item) => item.id === "sales")!;
    product.outputs[0]!.tables = [];
    expect(passports(resolved)["sales.md"]).toContain("Not built in this environment.");
  });

  it("writes checks that contain backticks as code that stays whole", () => {
    expect(passports(model(project()))["customers.md"]).toContain(
      "- `email_not_null`: `` `email` IS NOT NULL ``, checked on every load",
    );
  });

  it("lists rules nothing checks, with why", () => {
    const folder = project((root) => {
      const file = join(root, "contracts/daily_sales.yaml");
      const rules = [
        "    quality:",
        "      - { type: text, name: whole_days, description: Each day is a whole calendar day. }",
        "      - { type: library, metric: rowCount, mustBeGreaterThan: 0 }",
        "",
      ].join("\n");
      writeFileSync(
        file,
        readFileSync(file, "utf8").replace("    properties:\n", `${rules}    properties:\n`),
      );
    });
    const page = passports(model(folder))["sales.md"]!;
    expect(page).toContain(
      "- `whole_days`: Each day is a whole calendar day. Not checked: it is written for people to follow.",
    );
    expect(page).toMatch(/- `daily_sales_rowcount`: Not checked: it counts all rows/);
  });

  it("writes a URN id's passport under a safe file name, and links to it", () => {
    const folder = project((root) => {
      const file = join(root, "contracts/sales.product.yaml");
      writeFileSync(
        file,
        readFileSync(file, "utf8").replace("id: sales", 'id: "urn:product:sales"'),
      );
    });
    const files = passports(model(folder));
    expect(Object.keys(files).sort()).toEqual([
      "README.md",
      "customers.md",
      "urn-product-sales.md",
    ]);
    expect(files["README.md"]).toContain("[Daily sales](urn-product-sales.md)");
  });

  it("lists every product in the index", () => {
    const index = passports(model(project()))["README.md"]!;
    expect(index).toContain("[Customers](customers.md)");
    expect(index).toContain("Everyone who has bought from the web shop.");
    expect(index).not.toContain("Updated hourly");
  });

  it("is the same every run", () => {
    const folder = project();
    expect(passports(model(folder))).toEqual(passports(model(folder)));
  });
});
