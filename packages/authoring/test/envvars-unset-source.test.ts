// A flow whose source and a setting of mixed types come from ${envvar:…}: an unset variable
// is only information, and a set one never takes the labels and hovers away.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { annotationsIn } from "../src/annotations.js";
import { problems } from "../src/diagnostics.js";
import { hoverAt } from "../src/hover.js";
import { generatedFiles } from "../src/preview.js";
import { openProject, resolvedForDisplay } from "../src/project.js";

const template = join(import.meta.dirname, "../../cli/project-templates/minimal");
const names = ["INGT_SRC", "INGT_CLUSTER", "INGT_CONTRACT"];
const saved = new Map<string, string | undefined>();
const folders: string[] = [];
const flow = "flows/orders.yaml";

/**
 * The minimal Databricks starter whose flow reads its source and its `cluster_by`, which
 * is `auto`, `none` or a list of columns, from ${envvar:…}.
 */
function workspace(files: Record<string, string> = {}, contract = "shop.orders"): string {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-authoring-unset-source-"));
  folders.push(folder);
  cpSync(template, folder, { recursive: true, filter: (path) => !path.includes("/build") });
  writeFileSync(
    join(folder, flow),
    [
      "apiVersion: ingestron.io/v1",
      "kind: Flow",
      "id: orders",
      "source: ${envvar:INGT_SRC}",
      "store:",
      '  with: { cluster_by: "${envvar:INGT_CLUSTER}" }',
      "tables:",
      `  orders: { object: orders, contract: "${contract}" }`,
      "",
    ].join("\n"),
  );
  for (const [file, text] of Object.entries(files)) writeFileSync(join(folder, file), text);
  return folder;
}

const set = { ".env.dev": "INGT_SRC=shop\nINGT_CLUSTER=none\n" };

beforeEach(() => {
  for (const name of names) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
});

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe("an unset reference in a flow's source and in an anyOf setting", () => {
  it("gives only the information for each unset variable", () => {
    const found = problems(openProject(workspace(), new Map()), "dev");
    expect(found.map(({ code, severity }) => ({ code, severity }))).toEqual([
      { code: "ENVVAR_MISSING", severity: "information" },
      { code: "ENVVAR_MISSING", severity: "information" },
    ]);
  });

  it("keeps the table labels when the variables are unset", () => {
    const folder = workspace();
    const text = readFileSync(join(folder, flow), "utf8");
    const labels = annotationsIn(openProject(folder, new Map()), flow, text, "dev");
    expect(labels.map((item) => item.label)).toContain("→ dev.bronze.orders");
  });

  it("is clean, and keeps the labels and hovers, when .env sets the variables", () => {
    const folder = workspace(set);
    const project = openProject(folder, new Map());
    expect(problems(project, "dev")).toEqual([]);
    const display = resolvedForDisplay(project, "dev");
    expect(display.diagnostics.map(({ code }) => code)).not.toContain("PACK_CHECK");
    const text = readFileSync(join(folder, flow), "utf8");
    const labels = annotationsIn(project, flow, text, "dev").map((item) => item.label);
    expect(labels).toContain("→ dev.bronze.orders");
    const hover = hoverAt(project, flow, text, text.indexOf("  orders:") + 3, "dev");
    expect(hover).toMatch(/^\*\*`orders`\*\* → `dev`\.`bronze`\.`orders`/);
  });

  it("does not say there is nothing to generate when a table is left out for one", () => {
    const folder = workspace(set, "${envvar:INGT_CONTRACT}");
    const found = problems(openProject(folder, new Map()), "dev");
    expect(found.map(({ code, severity }) => ({ code, severity }))).toEqual([
      { code: "ENVVAR_MISSING", severity: "information" },
    ]);
  });

  it("previews no files built from a source that is not known, and says why", () => {
    const unset = generatedFiles(openProject(workspace(), new Map()), "dev");
    expect(unset).toEqual({
      problems:
        "dev: the generated files are not shown while a flow's source is not known: ${envvar:INGT_SRC} is not set.",
    });
    const built = generatedFiles(openProject(workspace(set), new Map()), "dev");
    expect(Array.isArray(built) && built.length > 0).toBe(true);
  });
});
