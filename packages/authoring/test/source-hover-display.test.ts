// The hover on a flow table's source columns shows what the files say, never what an environment
// variable is set to, and writes every name so that Markdown cannot change it: code spans that
// a backtick cannot end, an array's items, and at most 50 columns.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectSnapshot } from "../src/index.js";
import { files } from "./source-project.js";

const variable = "INGESTRON_TEST_HOVER_TABLE";
const folders: string[] = [];
afterEach(() => {
  delete process.env[variable];
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

/** The hover at `find` (plus `inside`) in the flow, on the fixture with `changes` written over it. */
function hover(changes: Record<string, string>, find: string, inside = 2): string | undefined {
  const folder = mkdtempSync(join(tmpdir(), "source-hover-display-"));
  folders.push(folder);
  const all = { ...files, ...changes };
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    writeFileSync(join(folder, path), text);
  }
  const flow = all["flows/erp.yaml"]!;
  return ProjectSnapshot.open(folder).hoverAt(
    "flows/erp.yaml",
    flow,
    flow.indexOf(find) + inside,
    "dev",
  );
}

/** Metadata with one table, ERP.dbo.Customers, whose columns are `columns` (YAML list items). */
const oneTable = (columns: string[]) => ({
  "sources/erp.yaml": [
    "apiVersion: ingestron.io/v1",
    "kind: SourceMetadata",
    "id: erp",
    "connection: erp",
    "names: { parts: 3, caseSensitive: false }",
    "tables:",
    "  - object: ERP.dbo.Customers",
    "    captured: { at: 2026-11-12T09:30:00Z, from: catalog, file: sources/erp.catalog.csv }",
    "    columns:",
    ...columns.map((column) => `      - ${column}`),
    "",
  ].join("\n"),
});

/** The customers table's object with `part` for its last part. */
const lastPart = (part: string) => ({
  "flows/erp.yaml": files["flows/erp.yaml"]!.replace(
    "object: ERP.dbo.Customers",
    `object: "ERP.dbo.${part}"`,
  ),
});

describe("the source columns hover and environment variables", () => {
  it("never shows a value of the editor's environment, nor columns it would choose", () => {
    // Set, the variable would make the object ERP.dbo.Customers, which has an entry.
    process.env[variable] = "omers";
    for (const [find, inside] of [
      ["customers:", 2],
      ["ERP.dbo.Cust", 4],
    ] as const) {
      const text = hover(lastPart(`Cust\${envvar:${variable}}`), find, inside) ?? "";
      expect(text).not.toContain("Customers");
      expect(text).not.toContain("Columns of");
    }
  });

  it("shows no columns for a reference that is not set, even when one table would match", () => {
    const columns = ["{ name: CustomerID, sourceType: int, logicalType: integer, required: true }"];
    // A last part that is only a reference matches every table, and there is one.
    const changes = { ...lastPart(`\${envvar:${variable}}`), ...oneTable(columns) };
    const text = hover(changes, "customers:") ?? "";
    expect(text).not.toContain("Columns of");
  });
});

describe("the source columns hover's Markdown", () => {
  it("keeps a name with backticks in its code span, and escapes a type's formatting", () => {
    const text = hover(
      oneTable([
        '{ name: "a`b", sourceType: "<b>int</b>", logicalType: integer, required: true }',
        '{ name: "`edge`", sourceType: "*bold*", logicalType: string, required: false }',
        '{ name: "two\\nlines", logicalType: string, required: false }',
      ]),
      "customers:",
    );
    expect(text).toContain("- ``a`b``: \\<b\\>int\\</b\\>\n");
    expect(text).toContain("- `` `edge` ``: \\*bold\\*\n");
    expect(text).toContain("- `two\\nlines`: string\n");
  });

  it("lists an array's items one level in", () => {
    const text = hover(
      oneTable([
        "{ name: Tags, sourceType: json, logicalType: array, required: false, items: { name: items, sourceType: nvarchar(20), logicalType: string, required: true } }",
      ]),
      "customers:",
    );
    expect(text).toContain("- `Tags`: json\n  - `items`: nvarchar(20)\n");
  });

  it("lists 50 columns and counts the rest", () => {
    const columns = Array.from(
      { length: 62 },
      (_, n) => `{ name: c${n}, logicalType: string, required: false }`,
    );
    const text = hover(oneTable(columns), "customers:")!;
    expect(text).toContain("- `c49`: string\n- and 12 more\n");
    expect(text).not.toContain("`c50`");
  });
});
