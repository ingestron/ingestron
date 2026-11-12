// The hover on a flow table's source columns, the fix that drafts its contract and the notice on
// the metadata document, on the project of the source completion tests with a key and a nested
// column added to the customers table.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectSnapshot, type QuickFix } from "../src/index.js";
import { files } from "./source-project.js";

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

/** A snapshot of the fixture project with `changes` (path → new text) written over its files. */
function open(changes: Record<string, string> = {}) {
  const folder = mkdtempSync(join(tmpdir(), "source-hover-fix-"));
  folders.push(folder);
  for (const [path, text] of Object.entries({ ...files, ...changes })) {
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    writeFileSync(join(folder, path), text);
  }
  return { folder, snapshot: ProjectSnapshot.open(folder) };
}

const withKey = {
  "sources/erp.yaml": files["sources/erp.yaml"]!.replace(
    "      - { name: CustomerID, sourceType: int, logicalType: integer, required: true }\n" +
      "      - { name: Email, sourceType: nvarchar(200), logicalType: string, required: false }\n",
    "      - { name: CustomerID, sourceType: int, logicalType: integer, required: true, primaryKeyPosition: 1 }\n" +
      "      - { name: Email, sourceType: nvarchar(200), logicalType: string, required: false }\n" +
      "      - name: Address\n" +
      "        sourceType: xml\n" +
      "        logicalType: object\n" +
      "        required: false\n" +
      "        properties:\n" +
      "          - { name: City, sourceType: nvarchar(80), logicalType: string, required: false }\n",
  ),
};

const flow = files["flows/erp.yaml"]!;
const offsetOf = (text: string, find: string, inside = 0) => text.indexOf(find) + inside;
const lineOf = (text: string, find: string) =>
  text.slice(0, text.indexOf(find)).split("\n").length - 1;

describe("the hover on a flow table without a contract", () => {
  const expected = [
    "Columns of `ERP.dbo.Customers` in the source metadata:",
    "",
    "- `CustomerID`: int, key",
    "- `Email`: nvarchar(200)",
    "- `Address`: xml",
    "  - `City`: nvarchar(80)",
    "",
    "Captured 2026-11-12 from catalog (sources/erp.catalog.csv).",
  ].join("\n");

  it("lists the source columns on the table's key, the key marked and a nested column indented", () => {
    const { snapshot } = open(withKey);
    const hover = snapshot.hoverAt("flows/erp.yaml", flow, offsetOf(flow, "customers:", 2), "dev");
    expect(hover).toContain(expected);
  });

  it("lists them on the table's object too", () => {
    const { snapshot } = open(withKey);
    const hover = snapshot.hoverAt(
      "flows/erp.yaml",
      flow,
      offsetOf(flow, "ERP.dbo.Customers", 4),
      "dev",
    );
    expect(hover).toContain(expected);
  });

  it("adds nothing for a table with a contract, nor for a table without an entry", () => {
    const { snapshot } = open(withKey);
    const orders = snapshot.hoverAt("flows/erp.yaml", flow, offsetOf(flow, "orders:", 2), "dev");
    expect(orders).toBeDefined();
    expect(orders).not.toContain("source metadata");
    const returns = snapshot.hoverAt("flows/erp.yaml", flow, offsetOf(flow, "returns:", 2), "dev");
    expect(returns ?? "").not.toContain("source metadata");
    const object = snapshot.hoverAt(
      "flows/erp.yaml",
      flow,
      offsetOf(flow, "ERP.dbo.Orders", 4),
      "dev",
    );
    expect(object ?? "").not.toContain("source metadata");
  });

  it("leaves the existing hover on the key as it was", () => {
    const { snapshot } = open(withKey);
    const hover = snapshot.hoverAt("flows/erp.yaml", flow, offsetOf(flow, "customers:", 2), "dev")!;
    // The table cannot resolve while it needs a contract, so the hover says so, then the columns.
    expect(
      hover.startsWith("The project has problems; fix them to see how this table resolves."),
    ).toBe(true);
  });
});

describe("the fix for CONTRACT_NEEDED", () => {
  // The problem is at the table, which the definitions place at its first key, `object`.
  const line = lineOf(flow, "    object: ERP.dbo.Customers");
  const at = { start: { line, character: 4 }, end: { line, character: 4 } };
  const applied = (fix: QuickFix, folder: string) => {
    const copy = mkdtempSync(join(tmpdir(), "source-hover-fix-copy-"));
    folders.push(copy);
    cpSync(folder, copy, { recursive: true });
    if (fix.create) {
      mkdirSync(dirname(join(copy, fix.create.file)), { recursive: true });
      writeFileSync(join(copy, fix.create.file), fix.create.text);
    }
    return ProjectSnapshot.open(copy, new Map(editedTexts(fix, folder, copy)));
  };

  it("drafts the contract from the metadata and names it", () => {
    const { snapshot } = open(withKey);
    expect(snapshot.problems("dev").some((p) => p.code === "CONTRACT_NEEDED")).toBe(true);
    const found = snapshot.quickFixes("dev", "flows/erp.yaml", at);
    expect(found.map((fix) => fix.title)).toEqual(["Draft a contract from the source metadata"]);
    const fix = found[0]!;
    expect(fix.problem?.code).toBe("CONTRACT_NEEDED");
    expect(fix.create?.file).toBe("contracts/erp.customers.yaml");
    expect(fix.create?.text).toContain("id: erp.customers");
    expect(fix.create?.text).toContain("primaryKey: true");
    expect(fix.edits).toEqual([
      {
        file: "flows/erp.yaml",
        range: { start: expect.any(Object), end: expect.any(Object) },
        text: "    contract: erp.customers\n",
      },
    ]);
  });

  it("applying the file and the edit leaves no CONTRACT_NEEDED for the table", () => {
    const { snapshot, folder } = open(withKey);
    const fix = snapshot.quickFixes("dev", "flows/erp.yaml", at)[0]!;
    const after = applied(fix, folder);
    const needed = after.problems("dev").filter((problem) => problem.code === "CONTRACT_NEEDED");
    expect(needed.map((problem) => problem.message)).toEqual([
      expect.stringContaining('"returns"'),
    ]);
    expect(after.problems("dev").filter((problem) => problem.severity === "error")).toEqual(needed);
  });

  it("only adds the line when the contract's file exists, and says which file", () => {
    const existing = files["contracts/orders.yaml"]!.replace(
      "id: erp.orders",
      "id: erp.customers",
    ).replace("OrderID", "CustomerID");
    const { snapshot, folder } = open({ ...withKey, "contracts/erp.customers.yaml": existing });
    const found = snapshot.quickFixes("dev", "flows/erp.yaml", at);
    expect(found.map((fix) => fix.title)).toEqual(["Use contracts/erp.customers.yaml"]);
    expect(found[0]?.create).toBeUndefined();
    const needed = applied(found[0]!, folder)
      .problems("dev")
      .filter((problem) => problem.code === "CONTRACT_NEEDED");
    expect(needed.map((problem) => problem.message)).toEqual([
      expect.stringContaining('"returns"'),
    ]);
  });

  it("offers nothing for a table with no entry", () => {
    const { snapshot } = open(withKey);
    const returns = lineOf(flow, "    object: ERP.dbo.Returns");
    const here = { start: { line: returns, character: 4 }, end: { line: returns, character: 4 } };
    expect(snapshot.quickFixes("dev", "flows/erp.yaml", here)).toEqual([]);
  });
});

describe("the notice on the metadata document", () => {
  it("is an annotation on the first line", () => {
    const { snapshot } = open();
    const text = files["sources/erp.yaml"]!;
    expect(snapshot.annotationsIn("sources/erp.yaml", text, "dev")).toContainEqual({
      line: 0,
      label: "Written by ingestron source import. Do not edit: import again to replace it.",
    });
  });

  it("is on no other document", () => {
    const { snapshot } = open();
    const text = files["contracts/orders.yaml"]!;
    const labels = snapshot.annotationsIn("contracts/orders.yaml", text, "dev").map((a) => a.label);
    expect(labels.join()).not.toContain("Written by ingestron");
  });
});

/** The text each edit of the fix gives its file, applied to the file in `folder`. */
function editedTexts(fix: QuickFix, folder: string, copy: string): [string, string][] {
  return fix.edits.map((edit) => [join(copy, edit.file), applyOne(folder, edit)]);
}

function applyOne(folder: string, edit: QuickFix["edits"][number]): string {
  const text = readFileSync(join(folder, edit.file), "utf8");
  const lines = text.split("\n");
  const offset = (position: { line: number; character: number }) =>
    lines.slice(0, position.line).reduce((sum, line) => sum + line.length + 1, 0) +
    position.character;
  return text.slice(0, offset(edit.range.start)) + edit.text + text.slice(offset(edit.range.end));
}
