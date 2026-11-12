// The fix that drafts a table's contract finds the table the problem is at, whatever the flow's
// style, its comments and its number of tables: the flow is parsed once and the drafts are made
// once per snapshot.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectSnapshot } from "../src/index.js";
import { files } from "./source-project.js";

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

/** A snapshot of the fixture project with `changes` (path → new text) written over its files. */
function open(changes: Record<string, string>) {
  const folder = mkdtempSync(join(tmpdir(), "source-fix-"));
  folders.push(folder);
  for (const [path, text] of Object.entries({ ...files, ...changes })) {
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    writeFileSync(join(folder, path), text);
  }
  return ProjectSnapshot.open(folder);
}

const entry = (object: string) =>
  [
    `  - object: ${object}`,
    "    captured: { at: 2026-11-12T09:30:00Z, from: catalog, file: sources/erp.catalog.csv }",
    "    columns:",
    "      - { name: id, sourceType: int, logicalType: integer, required: true }",
  ].join("\n");

/** The metadata with an entry for ERP.dbo.Returns too, so two tables of the flow can be drafted. */
const withReturns = {
  "sources/erp.yaml": `${files["sources/erp.yaml"]}${entry("ERP.dbo.Returns")}\n`,
};

/** The file each CONTRACT_NEEDED problem's fix would create, by the table the problem names. */
function draftedFiles(snapshot: ProjectSnapshot): Record<string, string | undefined> {
  const needed = snapshot.problems("dev").filter((problem) => problem.code === "CONTRACT_NEEDED");
  return Object.fromEntries(
    needed.map((problem) => {
      const at = { start: problem.range.start, end: problem.range.start };
      const [fix] = snapshot.quickFixes("dev", "flows/erp.yaml", at);
      return [/"(\w+)"/.exec(problem.message)?.[1], fix?.create?.file];
    }),
  );
}

describe("the fix that drafts a contract", () => {
  it("drafts each of two tables in one flow from its own entry", () => {
    expect(draftedFiles(open(withReturns))).toEqual({
      customers: "contracts/erp.customers.yaml",
      returns: "contracts/erp.returns.yaml",
    });
  });

  it("finds a table written in flow style", () => {
    const flow = files["flows/erp.yaml"]!.replace(
      "  customers:\n    object: ERP.dbo.Customers\n    expectations:\n      - name: has_email\n        check: Email IS NOT NULL\n",
      "  customers: { object: ERP.dbo.Customers, expectations: [{ name: has_email, check: Email IS NOT NULL }] }\n",
    );
    expect(flow).toContain("customers: {");
    expect(draftedFiles(open({ ...withReturns, "flows/erp.yaml": flow }))).toEqual({
      customers: "contracts/erp.customers.yaml",
      returns: "contracts/erp.returns.yaml",
    });
  });

  it("finds a table with comments around it and inside it", () => {
    const flow = files["flows/erp.yaml"]!.replace(
      "  returns:\n    object: ERP.dbo.Returns\n",
      "  # Returns, from the ERP.\n\n  returns:\n    # The source table.\n    object: ERP.dbo.Returns # with comments\n",
    );
    expect(flow).toContain("# The source table.");
    expect(draftedFiles(open({ ...withReturns, "flows/erp.yaml": flow }))).toEqual({
      customers: "contracts/erp.customers.yaml",
      returns: "contracts/erp.returns.yaml",
    });
  });
});

describe("the fix for a flow of 1,000 tables", () => {
  const count = 1000;
  const numbers = Array.from({ length: count }, (_, index) => index);
  const large = {
    "flows/erp.yaml": [
      "apiVersion: ingestron.io/v1",
      "kind: Flow",
      "id: erp",
      "source: erp",
      "tables:",
      ...numbers.map(
        (n) =>
          `  t${n}:\n    object: ERP.dbo.T${n}\n    expectations:\n      - { name: has_id, check: id > 0 }`,
      ),
      "",
    ].join("\n"),
    "sources/erp.yaml": [
      "apiVersion: ingestron.io/v1",
      "kind: SourceMetadata",
      "id: erp",
      "connection: erp",
      "names: { parts: 3, caseSensitive: false }",
      "tables:",
      ...numbers.map((n) => entry(`ERP.dbo.T${n}`)),
      "",
    ].join("\n"),
  };

  it("is found for the last table in well under a second", () => {
    // The best of three snapshots, so that other test files running at the same time do not
    // decide it; each snapshot's problems are found first, as the editor finds them first.
    const runs = [1, 2, 3].map(() => {
      const snapshot = open(large);
      const last = snapshot
        .problems("dev")
        .filter((problem) => problem.code === "CONTRACT_NEEDED")
        .at(-1)!;
      expect(last.message).toContain(`"t${count - 1}"`);
      const started = performance.now();
      const fixes = snapshot.quickFixes("dev", "flows/erp.yaml", {
        start: last.range.start,
        end: last.range.start,
      });
      const seconds = (performance.now() - started) / 1000;
      expect(fixes.map((fix) => fix.create?.file)).toEqual([`contracts/erp.t${count - 1}.yaml`]);
      return seconds;
    });
    expect(Math.min(...runs)).toBeLessThan(1);
  }, 120_000);
});
