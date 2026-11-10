// On starters whose flow names no ingest method and writes settings only the real one
// takes, a source read from ${envvar:…} is not known in the editor: no method is guessed.
// Their packs build every environment together, so such a source is supplied only when
// deploying, and the editor gives plan's error for it (DEPLOY_VALUE).
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { annotationsIn } from "../src/annotations/annotations.js";
import { problems } from "../src/diagnostics/diagnostics.js";
import { hoverAt } from "../src/hover/hover.js";
import { openProject } from "../src/project/project.js";
import { filledTemplates } from "./starters.js";

const name = "INGT_SRC";
let previous: string | undefined;
const folders: string[] = [];
const deployValue = { code: "DEPLOY_VALUE", severity: "error" };

const starters = [
  { template: "sql-server", flow: "flows/erp.yaml", source: "erp", table: "customers" },
  { template: "kafka", flow: "flows/events.yaml", source: "events", table: "page_views" },
  { template: "private-sql-server", flow: "flows/erp.yaml", source: "erp", table: "customers" },
];

/** A copy of the starter, with its flow's source read from ${envvar:INGT_SRC} unless `asWritten`. */
function workspace(
  starter: (typeof starters)[number],
  files: Record<string, string> = {},
  asWritten = false,
): string {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-authoring-unset-starter-"));
  folders.push(folder);
  cpSync(join(filledTemplates, starter.template), folder, {
    recursive: true,
    filter: (path) => !path.includes("/build"),
  });
  const flow = join(folder, starter.flow);
  const text = readFileSync(flow, "utf8");
  if (!asWritten)
    writeFileSync(
      flow,
      text.replace(`source: ${starter.source}\n`, `source: \${envvar:${name}}\n`),
    );
  for (const [file, content] of Object.entries(files)) writeFileSync(join(folder, file), content);
  return folder;
}

/**
 * With the source known, Lakeflow Connect ingests the table, and nothing checks the
 * starter's required columns there: each is this one warning (pack-databricks, spec 8.2).
 */
const notChecked =
  "The notNull rule isn't applied on databricks: Managed ingestion writes the table as the source gives it; check it in a transform in the next layer.";

/** The problems, without the required columns' `notChecked` warnings. */
function besidesManaged(found: ReturnType<typeof problems>) {
  return found.filter(({ code, message }) => !(code === "NOT_APPLIED" && message === notChecked));
}

function labels(folder: string, flow: string): string[] {
  const text = readFileSync(join(folder, flow), "utf8");
  return annotationsIn(openProject(folder, new Map()), flow, text, "dev").map(({ label }) => label);
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

describe.each(starters)("an unset source on the $template starter", (starter) => {
  it("gives plan's error for a source supplied when deploying, and no .env advice", () => {
    const found = problems(openProject(workspace(starter), new Map()), "dev");
    expect(found.map(({ code, severity }) => ({ code, severity }))).toEqual([deployValue]);
  });

  it("keeps the labels the written source gives when .env sets the variable", () => {
    const folder = workspace(starter, { ".env.dev": `${name}=${starter.source}\n` });
    const found = besidesManaged(problems(openProject(folder, new Map()), "dev"));
    expect(found.map(({ code, severity }) => ({ code, severity }))).toEqual([deployValue]);
    const expected = labels(workspace(starter, {}, true), starter.flow);
    expect(expected.length).toBeGreaterThan(0);
    expect(labels(folder, starter.flow)).toEqual(expected);
  });

  it("says in the hover that the ingest method is not known, and names no default", () => {
    const folder = workspace(starter, { ".env.dev": `${name}=${starter.source}\n` });
    const text = readFileSync(join(folder, starter.flow), "utf8");
    const offset = text.indexOf(`  ${starter.table}:`) + 3;
    const hover = hoverAt(openProject(folder, new Map()), starter.flow, text, offset, "dev");
    expect(hover).toContain(
      `**ingest**: not known yet: the source is \`\${envvar:${name}}\`, and no \`uses\` names it.`,
    );
    expect(hover).not.toContain("`files`");
  });
});
