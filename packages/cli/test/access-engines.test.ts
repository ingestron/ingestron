// Access across three packs in one environment: ADF lands the files, Databricks keeps one table,
// and Synapse serves another straight from the landed files. With a masked column and tags off,
// the Databricks task grants only the table it keeps, makes its policies before it grants, and
// the passport says the mask is not enforced (spec/cli/passport.md, "Access").
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { nodeFiles } from "@ingestron/config";
import { generatedOutputs } from "@ingestron/core";
import { describe, expect, it } from "vitest";

const files: Record<string, string> = {
  "project.yaml": `id: shop
values:
  host: https://adb-1111111111111111.1.azuredatabricks.net
  landing: abfss://landing@shopdev.dfs.core.windows.net/shop
  storage: abfss://landing@shopdev.dfs.core.windows.net
  key_vault: https://kv-shop-dev.vault.azure.net
environments:
  dev: {}
imports: ["*.yaml", "contracts/*.yaml"]
`,
  "standard.yaml": `apiVersion: ingestron.io/v1
kind: Standard
id: shop
packs: [databricks@2, adf@2, synapse@2]
ingest:
  settings:
    adf-copy:
      layout: snapshot
      every: { frequency: Hour, interval: 24 }
      start: 2026-10-01T00:00:00Z
governance:
  classification: { sensitive: [confidential] }
  access: { grants: exact }
  masks: { confidential: hash }
`,
  "platform.yaml": `apiVersion: ingestron.io/v1
kind: Platform
id: azure
settings:
  adf-copy:
    landing: \${values.landing}
    key_vault: \${values.key_vault}
    integration_runtime: shir-shop
  synapse-serve:
    data_source: landing
    data_source_location: \${values.storage}
databricks:
  workspace:
    host: \${values.host}
  run_as:
    service_principal_name: 7f3c2a10-0000-4000-8000-000000000001
  manage: { grants: true, masks: true }
  governance:
    functions: dev_shop.governance
synapse:
  manage: { grants: true }
`,
  "connection.yaml": `apiVersion: ingestron.io/v1
kind: Connection
id: shop
connector: sqlserver
connectivity: private
settings:
  server: shop-sql01.corp.local
  user: ingest_reader
  password: \${secret:shop-sql-password}
`,
  "kept.yaml": `apiVersion: ingestron.io/v1
kind: Flow
id: kept
source: shop
tables:
  customers: { object: shop.dbo.Customers, contract: shop.customers }
`,
  "served.yaml": `apiVersion: ingestron.io/v1
kind: Flow
id: served
source: shop
store: { uses: none }
serve: { uses: synapse-serve }
tables:
  invoices: { object: shop.dbo.Invoices, contract: shop.invoices }
`,
  "products.yaml": `apiVersion: v1.1.0
kind: DataProduct
id: shop
status: active
team:
  members:
    - { username: mia@example.com, role: owner }
outputPorts:
  - { name: customers, contractId: shop.customers }
`,
  "contracts/customers.yaml": contract("customers", "email"),
  "contracts/invoices.yaml": contract("invoices", "billing_email"),
};

/** A contract with a key, a masked column and a modified time, read by one role. */
function contract(name: string, masked: string): string {
  return `apiVersion: v3.1.0
kind: DataContract
id: shop.${name}
version: 1.0.0
status: active
schema:
  - name: ${name}
    logicalType: object
    properties:
      - { name: id, logicalType: integer, required: true, primaryKey: true }
      - { name: ${masked}, logicalType: string, classification: confidential }
      - { name: modified_at, logicalType: timestamp, required: true }
roles:
  - { role: analysts, access: read }
`;
}

function project(): string {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-access-engines-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    writeFileSync(join(folder, path), text);
  }
  return folder;
}

const generated = generatedOutputs(nodeFiles(project()));
const output = (name: string) => generated.outputs.find((item) => item.name === name)!;
const task = () => {
  const files = output("databricks").files;
  const path = Object.keys(files).find((item) => item.endsWith("apply_contract.py"))!;
  return files[path]!;
};

describe("access across ADF, Databricks and Synapse", () => {
  it("resolves and builds every pack's files", () => {
    expect(generated.ok, JSON.stringify(generated.environmentReports)).toBe(true);
  });

  it("grants on Databricks only the table Databricks keeps", () => {
    const found = /^ACCESS = json\.loads\(r"""([\s\S]*?)"""\)$/m.exec(task());
    const names = (JSON.parse(found![1]!) as { name: string }[]).map((item) => item.name);
    expect(names.some((name) => name.endsWith(".customers"))).toBe(true);
    expect(names.some((name) => name.includes("invoices"))).toBe(false);
  });

  it("makes the policies before it grants", () => {
    const main = task().slice(task().indexOf("def main():"));
    expect(main.indexOf("apply_policies(spark)")).toBeGreaterThan(0);
    expect(main.indexOf("apply_policies(spark)")).toBeLessThan(main.indexOf("apply_access(spark)"));
  });

  it("grants the served view on Synapse", () => {
    const views = Object.entries(output("synapse").files).find(([path]) =>
      path.endsWith("views.sql"),
    )![1];
    expect(views).toContain("GRANT SELECT ON OBJECT::");
    expect(views).toContain("[invoices] TO [analysts];");
  });

  it("says in the passport that the mask is not enforced while tags are off", () => {
    const page = output("products").files["dev/shop.md"]!;
    expect(page).toContain(
      "- `email` (confidential): hashed. Not enforced on Databricks: the platform has tags off, and masks find columns by their tags.",
    );
  });
});
