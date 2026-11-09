// A flow whose source and a setting of mixed types come from ${envvar:…}: an unset variable
// is only information, and a set one never takes the labels and hovers away. For a pack
// that builds every environment together, a source supplied when deploying is the error
// plan gives (DEPLOY_VALUE); DuckDB reads the variable when generating.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { annotationsIn } from "../src/annotations/annotations.js";
import { problems } from "../src/diagnostics/diagnostics.js";
import { hoverAt } from "../src/hover/hover.js";
import { generatedFiles } from "../src/generation/preview.js";
import { openProject, resolvedForDisplay } from "../src/project/project.js";
import { filledTemplates } from "./starters.js";

const templates = filledTemplates;
const template = join(templates, "minimal");
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
const deployValue = { code: "DEPLOY_VALUE", severity: "error" };

/** The DuckDB starter, whose flow reads its source from ${envvar:INGT_SRC}. */
function duckdb(files: Record<string, string> = {}): string {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-authoring-unset-source-"));
  folders.push(folder);
  cpSync(join(templates, "duckdb"), folder, { recursive: true });
  const orders = join(folder, "flows/orders.yaml");
  writeFileSync(
    orders,
    readFileSync(orders, "utf8").replace("source: shop", "source: ${envvar:INGT_SRC}"),
  );
  for (const [file, text] of Object.entries(files)) writeFileSync(join(folder, file), text);
  return folder;
}

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
  it("gives plan's error for the source in place of its advice, and says the setting is supplied when deploying", () => {
    const found = problems(openProject(workspace(), new Map()), "dev");
    expect(found.map(({ code, severity }) => ({ code, severity }))).toEqual([
      { code: "ENVVAR_MISSING", severity: "information" },
      deployValue,
    ]);
    expect(found[0]?.message).toBe(
      "INGT_CLUSTER is supplied when deploying. Plan does not read it, so it needs no .env.dev entry.",
    );
    expect(found[1]?.file).toBe(flow);
    expect(found[1]?.range.start.line).toBe(3);
  });

  it("gives only the information for an unset source DuckDB reads when generating", () => {
    const found = problems(openProject(duckdb(), new Map()), "dev");
    expect(found.map(({ code, severity }) => ({ code, severity }))).toEqual([
      { code: "ENVVAR_MISSING", severity: "information" },
    ]);
  });

  it("keeps the table labels when the variables are unset", () => {
    const folder = workspace();
    const text = readFileSync(join(folder, flow), "utf8");
    const labels = annotationsIn(openProject(folder, new Map()), flow, text, "dev");
    expect(labels.map((item) => item.label)).toContain("→ dev.bronze.orders");
  });

  it("keeps the labels and hovers when .env sets the variables, and still plan's error", () => {
    const folder = workspace(set);
    const project = openProject(folder, new Map());
    const found = problems(project, "dev").map(({ code, severity }) => ({ code, severity }));
    expect(found).toEqual([deployValue]);
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
    // The source and the contract are each supplied only when deploying: plan's errors alone.
    expect(found.map(({ code, severity }) => ({ code, severity }))).toEqual([
      deployValue,
      deployValue,
    ]);
  });

  it("previews no files built from a source that is not known, and says what plan says", () => {
    const unset = generatedFiles(openProject(duckdb(), new Map()), "dev");
    expect(unset).toEqual({
      problems: [
        "dev: the definitions have problems",
        "flows/orders.yaml:4:9  error  ENVVAR_MISSING",
        "  Environment variable INGT_SRC is not set.",
        '  Set INGT_SRC, add it to .env.dev or .env, or remove "${envvar:INGT_SRC}".',
      ].join("\n"),
    });
    const built = generatedFiles(
      openProject(duckdb({ ".env.dev": "INGT_SRC=shop\n" }), new Map()),
      "dev",
    );
    expect(Array.isArray(built) && built.length > 0).toBe(true);
  });

  it("previews no files for a source supplied when deploying, and says what plan says", () => {
    const supplied = generatedFiles(openProject(workspace(set), new Map()), "dev");
    expect(Array.isArray(supplied) ? "files" : supplied.problems).toMatch(
      /^dev: the definitions have problems\nflows\/orders\.yaml:4:9 {2}error {2}DEPLOY_VALUE\n/,
    );
  });
});
