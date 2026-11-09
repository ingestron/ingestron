// A method setting written somewhere other than where its method says it
// belongs can be moved there, in one edit across both files.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { QuickFix } from "../../src/assist/fixes.js";
import { moveSetting } from "../../src/assist/moves.js";
import { openProject } from "../../src/project/project.js";
import { offsetAt } from "../../src/project/yaml.js";
import { filledTemplates } from "../starters.js";

const folder = join(filledTemplates, "private-sql-server");
const disk = (file: string) => readFileSync(join(folder, file), "utf8");

/** The project with `texts` open, and the move offered at `|` in `file`. */
function moveAt(file: string, marked: string, texts: Record<string, string> = {}) {
  const text = marked.replace("|", "");
  const open = new Map(
    Object.entries({ ...texts, [file]: text }).map(([name, value]) => [join(folder, name), value]),
  );
  const project = openProject(folder, open);
  return { project, moves: moveSetting(project, file, text, marked.indexOf("|"), "dev") };
}

/** Each file's text after the fix. */
function applied(project: ReturnType<typeof openProject>, fix: QuickFix): Record<string, string> {
  const out: Record<string, string> = {};
  for (const file of new Set(fix.edits.map((edit) => edit.file))) {
    const text = project.files.read(file) ?? "";
    out[file] = fix.edits
      .filter((edit) => edit.file === file)
      .map((edit) => ({
        start: offsetAt(text, edit.range.start),
        end: offsetAt(text, edit.range.end),
        text: edit.text,
      }))
      .sort((a, b) => b.start - a.start)
      .reduce((all, edit) => all.slice(0, edit.start) + edit.text + all.slice(edit.end), text);
  }
  return out;
}

describe("moveSetting", () => {
  it("moves a platform setting from a flow table to the platform", () => {
    const platform = disk("platform.yaml").replace("    integration_runtime: shir-erp\n", "");
    const flow = disk("flows/erp.yaml").replace(
      "    contract: erp.customers\n",
      "    contract: erp.customers\n    ingest: { with: { integration_|runtime: shir-2 } }\n",
    );
    const { project, moves } = moveAt("flows/erp.yaml", flow, { "platform.yaml": platform });
    expect(moves.map((move) => move.title)).toEqual([
      "Move integration_runtime to platform.yaml; it applies to every adf-copy table: customers, invoices",
    ]);
    const out = applied(project, moves[0]!);
    expect(out["flows/erp.yaml"]).toContain(
      "    object: erp.dbo.Customers\n    contract: erp.customers\n  invoices:",
    );
    expect(out["platform.yaml"]).toContain("    integration_runtime: shir-2\n");
  });

  it("moves a standard setting to the standard, saying it replaces the value there", () => {
    const flow = disk("flows/erp.yaml").replace(
      "with: { watermark_column: updated_at }",
      "with: { watermark_column: updated_at, ret|ries: 5 }",
    );
    const { project, moves } = moveAt("flows/erp.yaml", flow);
    expect(moves[0]?.title).toBe(
      "Move retries to standard.yaml; it applies to every adf-copy table: customers, invoices",
    );
    expect(applied(project, moves[0]!)["standard.yaml"]).toContain("      retries: 5\n");

    const every = disk("flows/erp.yaml").replace(
      "with: { watermark_column: updated_at }",
      "with: { watermark_column: updated_at, ev|ery: { frequency: Day, interval: 1 } }",
    );
    expect(moveAt("flows/erp.yaml", every).moves[0]?.title).toBe(
      "Move every to standard.yaml, replacing the value there; it applies to every adf-copy table: customers, invoices",
    );
  });

  it("is offered with the cursor on the setting's value too", () => {
    const flow = disk("flows/erp.yaml").replace(
      "with: { watermark_column: updated_at }",
      "with: { watermark_column: updated_at, every: { frequency: D|ay } }",
    );
    expect(moveAt("flows/erp.yaml", flow).moves[0]?.title).toMatch(/^Move every to standard.yaml/);
  });

  it("offers nothing for a setting already where it belongs", () => {
    const standard = disk("standard.yaml").replace("      start:", "      st|art:");
    expect(moveAt("standard.yaml", standard).moves).toEqual([]);
  });
});
