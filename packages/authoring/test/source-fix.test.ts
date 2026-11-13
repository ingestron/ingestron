// The fix that drafts a table's contract finds the table the problem is at, whatever the flow's
// style, its comments and its number of tables: the flow is parsed once and the drafts are made
// once per snapshot.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as CoreModule_ from "@ingestron/core";
import { ProjectSnapshot } from "../src/index.js";
import { files } from "./source-project.js";

type CoreModule = typeof CoreModule_;

// The drafts are counted, whatever the machine's load: the real function runs each time.
const { drafting } = vi.hoisted(() => ({ drafting: { calls: [] as unknown[][] } }));
vi.mock("@ingestron/core", async (original) => {
  const core = await original<CoreModule>();
  return {
    ...core,
    draftContracts: (...args: Parameters<typeof core.draftContracts>) => {
      drafting.calls.push(args);
      return core.draftContracts(...args);
    },
  };
});

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

describe("the fix that drafts a contract, while the project has other errors", () => {
  it("is offered for a table with an entry though another table has an error no draft mends", () => {
    // Returns has no entry, so its error stays; Customers is drafted all the same.
    expect(draftedFiles(open({}))).toEqual({
      customers: "contracts/erp.customers.yaml",
      returns: undefined,
    });
  });

  it("is not offered while an error the metadata does not settle stops the draft", () => {
    // The core's draft stops at such an error (spec/cli/sources.md, section 4), so there is none.
    const flow = files["flows/erp.yaml"]!.replace("source: erp", "source: nowhere");
    const snapshot = open({ "flows/erp.yaml": flow });
    expect(snapshot.problems("dev").some((problem) => problem.severity === "error")).toBe(true);
    const created = snapshot
      .problems("dev")
      .flatMap((problem) =>
        snapshot.quickFixes("dev", problem.file, {
          start: problem.range.start,
          end: problem.range.end,
        }),
      )
      .flatMap((fix) => fix.create?.file ?? []);
    expect(created.filter((file) => file.startsWith("contracts/erp."))).toEqual([]);
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

  it("drafts once for the snapshot, however many tables or fixes", () => {
    const snapshot = open(large);
    const needed = snapshot.problems("dev").filter((problem) => problem.code === "CONTRACT_NEEDED");
    expect(needed).toHaveLength(count);
    drafting.calls.length = 0;
    const started = performance.now();
    // The first, a middle and the last table, and the first again: four fixes, one draft.
    const fixes = [0, count / 2, count - 1, 0].map((n) => {
      const { range, message } = needed[n]!;
      expect(message).toContain(`"t${n}"`);
      const found = snapshot.quickFixes("dev", "flows/erp.yaml", {
        start: range.start,
        end: range.start,
      });
      return found.map((fix) => fix.create?.file);
    });
    expect(fixes).toEqual([
      ["contracts/erp.t0.yaml"],
      [`contracts/erp.t${count / 2}.yaml`],
      [`contracts/erp.t${count - 1}.yaml`],
      ["contracts/erp.t0.yaml"],
    ]);
    expect(drafting.calls).toHaveLength(1);
    expect(drafting.calls[0]?.[1]).toMatchObject({ needed: true });
    // A loose bound for a hang, not a measure of speed: it must hold on a loaded machine.
    expect((performance.now() - started) / 1000).toBeLessThan(10);
    // Another snapshot of the project drafts again: nothing is kept past a snapshot.
    const next = open(large);
    next.problems("dev");
    next.quickFixes("dev", "flows/erp.yaml", {
      start: needed[0]!.range.start,
      end: needed[0]!.range.start,
    });
    expect(drafting.calls).toHaveLength(2);
  }, 120_000);
});
