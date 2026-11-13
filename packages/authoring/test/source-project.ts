// A small project for the completion tests of the source metadata and the recipe catalog: a
// connection with a project recipe, a flow, two contracts and sources/erp.yaml.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll } from "vitest";
import { completionsAt } from "../src/assist/completion.js";
import { openProject } from "../src/project/project.js";

export const files: Record<string, string> = {
  "project.yaml": [
    "id: retail",
    "environments:",
    "  dev: {}",
    "imports:",
    "  - standard.yaml",
    "  - connections/*.yaml",
    "  - flows/*.yaml",
    "  - sources/*.yaml",
    "  - contracts/*.yaml",
    "",
  ].join("\n"),
  "standard.yaml":
    "apiVersion: ingestron.io/v1\nkind: Standard\nid: retail\npacks: [databricks@2]\nlayers:\n  - { name: bronze, does: raw }\n",
  "connections/erp.yaml": [
    "apiVersion: ingestron.io/v1",
    "kind: Connection",
    "id: erp",
    "connector: sqlserver",
    "connectivity: workspace",
    "settings:",
    "  uc_connection: erp_connection",
    "metadata:",
    "  from: acme",
    "  with:",
    "    tenant: north",
    "",
  ].join("\n"),
  "flows/erp.yaml": [
    "apiVersion: ingestron.io/v1",
    "kind: Flow",
    "id: erp",
    "source: erp",
    "tables:",
    "  customers:",
    "    object: ERP.dbo.Customers",
    "    expectations:",
    "      - name: has_email",
    "        check: Email IS NOT NULL",
    "  orders:",
    "    object: ERP.dbo.Orders",
    "    contract: erp.orders",
    "  returns:",
    "    object: ERP.dbo.Returns",
    "    expectations:",
    "      - name: has_id",
    "        check: id > 0",
    "",
  ].join("\n"),
  "contracts/orders.yaml": [
    "apiVersion: v3.1.0",
    "kind: DataContract",
    "id: erp.orders",
    "version: 1.0.0",
    "status: active",
    "schema:",
    "  - name: orders",
    "    logicalType: object",
    "    properties:",
    "      - name: OrderID",
    "        logicalType: integer",
    "",
  ].join("\n"),
  "contracts/loose.yaml": [
    "apiVersion: v3.1.0",
    "kind: DataContract",
    "id: loose",
    "version: 1.0.0",
    "status: active",
    "schema:",
    "  - name: loose",
    "    logicalType: object",
    "    properties:",
    "      - name: x",
    "        logicalType: integer",
    "",
  ].join("\n"),
  "sources/erp.yaml": [
    "apiVersion: ingestron.io/v1",
    "kind: SourceMetadata",
    "id: erp",
    "connection: erp",
    "names: { parts: 3, caseSensitive: false }",
    "tables:",
    "  - object: ERP.dbo.Customers",
    "    captured: { at: 2026-11-12T09:30:00Z, from: catalog, recipe: acme, file: sources/erp.catalog.csv }",
    "    columns:",
    "      - { name: CustomerID, sourceType: int, logicalType: integer, required: true }",
    "      - { name: Email, sourceType: nvarchar(200), logicalType: string, required: false }",
    "  - object: ERP.dbo.Orders",
    "    captured: { at: 2026-11-10T08:00:00Z, from: catalog, recipe: acme, file: sources/erp.catalog.csv }",
    "    columns:",
    "      - { name: OrderID, sourceType: int, logicalType: integer, required: true }",
    "      - { name: PlacedAt, sourceType: datetime2, logicalType: timestamp, required: false }",
    '      - { name: Total, sourceType: "decimal(18,2)", logicalType: number, required: false }',
    "  - object: ERP.dbo.Archive",
    "    captured: { at: 2026-11-01T00:00:00Z, from: catalog, recipe: acme, file: sources/erp.catalog.csv }",
    "    columns:",
    "      - { name: Only, logicalType: string, required: false }",
    "",
  ].join("\n"),
  "recipes/acme.yaml": [
    "id: acme",
    "title: Acme ERP",
    "kind: catalog",
    "inputs:",
    '  tenant: { description: "The tenant whose tables are loaded." }',
    '  region: { description: "The region the tenant is hosted in." }',
    "ask:",
    "  who: An Acme administrator",
    "  access: Read access to the catalog",
    "  call: https://{tenant}.acme.example/catalog",
    "  save: sources/{connection}.catalog.csv",
    "  how: Open the address and save the result.",
    "read: columns",
    "types:",
    "  - { match: '^int$', logicalType: integer }",
    "sources:",
    "  - { url: https://example.com/acme/catalog, read: 2026-11-12 }",
    "",
  ].join("\n"),
};

let folder = "";
/**
 * Writes the project to a temporary folder for the tests of the file that calls it, and gives
 * `created` the folder.
 */
export function useSourceProject(created?: (folder: string) => void): void {
  beforeAll(() => {
    folder = mkdtempSync(join(tmpdir(), "source-completion-"));
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(folder, path)), { recursive: true });
      writeFileSync(join(folder, path), text);
    }
    created?.(folder);
  });
  afterAll(() => rmSync(folder, { recursive: true, force: true }));
}

/**
 * Completions where `|` is in `path`'s text after `edit` (the file's text, or a replacement
 * of one line), and the project's other files are `others` instead of the fixture's.
 */
export function at(
  path: string,
  edit: (text: string) => string,
  others: Record<string, string> = {},
) {
  const marked = edit(files[path] ?? "");
  const offset = marked.indexOf("|");
  const text = marked.replace("|", "");
  const open = new Map(
    [[path, text], ...Object.entries(others)].map(([name, body]) => [join(folder, name!), body!]),
  );
  const project = openProject(folder, open);
  return completionsAt(project, path, text, offset, "dev");
}
export const brief = (items: { label: string; detail?: string }[]) =>
  items.map((item) => [item.label, item.detail]);

/** The fixture's metadata with Customers' columns named `names`. */
export function named(...names: string[]): Record<string, string> {
  const columns = names.map(
    (name) =>
      `      - { name: ${JSON.stringify(name)}, sourceType: int, logicalType: integer, required: false }`,
  );
  const text = files["sources/erp.yaml"]!.replace(
    /(object: ERP\.dbo\.Customers\n.*\n    columns:\n)(?:      - .*\n){2}/,
    `$1${columns.join("\n")}\n`,
  );
  return { "sources/erp.yaml": text };
}
