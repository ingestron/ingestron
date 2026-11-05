// A setting written with ${envvar:…} that the editor cannot fill is not judged: an unset
// variable is only information, and a set one never takes the labels and hovers away. The
// starter's self-hosted runtime gives ADF's notice (PACK_NOTICE) whatever the variable.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { annotationsIn } from "../src/annotations.js";
import { problems } from "../src/diagnostics.js";
import { hoverAt } from "../src/hover.js";
import { openProject } from "../src/project.js";
import { filledTemplates } from "./starters.js";

const template = join(filledTemplates, "private-files");
// A name no developer's shell sets, so "unset" is unset everywhere.
const name = "INGESTRON_TEST_KEY_VAULT";
const folders: string[] = [];
let previous: string | undefined;

/** The private-files starter, whose adf-files key_vault must match a pattern, read from ${envvar:…}. */
function workspace(files: Record<string, string> = {}): string {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-authoring-unset-"));
  folders.push(folder);
  cpSync(template, folder, { recursive: true, filter: (path) => !path.includes("/build") });
  const platform = join(folder, "platform.yaml");
  writeFileSync(
    platform,
    readFileSync(platform, "utf8").replace(
      "key_vault: https://${values.key_vault}.vault.azure.net",
      `key_vault: \${envvar:${name}}`,
    ),
  );
  for (const [file, text] of Object.entries(files)) writeFileSync(join(folder, file), text);
  return folder;
}

beforeEach(() => {
  previous = process.env[name];
  delete process.env[name];
});

afterEach(() => {
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

const flow = "flows/stores.yaml";
const notice = { code: "PACK_NOTICE", severity: "warning" };

describe("an unset reference in a pack setting", () => {
  it("an unset variable in a patterned pack setting gives only information", () => {
    const found = problems(openProject(workspace(), new Map()), "dev");
    expect(found.map(({ code, severity }) => ({ code, severity }))).toEqual([
      { code: "ENVVAR_MISSING", severity: "information" },
      notice,
    ]);
  });

  it("keeps the table labels and hovers when .env sets the variable", () => {
    const folder = workspace({ ".env.dev": `${name}=https://kv-placeholder.vault.azure.net\n` });
    const project = openProject(folder, new Map());
    const found = problems(project, "dev").map(({ code, severity }) => ({ code, severity }));
    expect(found).toEqual([notice]);
    const text = readFileSync(join(folder, flow), "utf8");
    const labels = annotationsIn(project, flow, text, "dev").map((item) => item.label);
    expect(labels).toContain("→ stores_dev.bronze.sales");
    const hover = hoverAt(project, flow, text, text.indexOf("  sales:") + 3, "dev");
    expect(hover).toMatch(/^\*\*`sales`\*\* → `stores_dev`\.`bronze`\.`sales`/);
    // What hovers and labels show never holds the value from .env.
    expect(JSON.stringify([labels, hover])).not.toContain("kv-placeholder");
  });

  it("keeps the table labels when the variable is unset", () => {
    const folder = workspace();
    const text = readFileSync(join(folder, flow), "utf8");
    const labels = annotationsIn(openProject(folder, new Map()), flow, text, "dev");
    expect(labels.map((item) => item.label)).toContain("→ stores_dev.bronze.sales");
  });
});
