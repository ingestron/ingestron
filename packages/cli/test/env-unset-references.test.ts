// Where a pack reads ${envvar:…} when generating (DuckDB), the CLI still stops at an unset one
// in a flow's source or settings, and a value from .env is used as if it were written in place.
// Where a pack builds every environment together (Databricks), a flow's source cannot wait
// until deploying: it is DEPLOY_VALUE, whatever .env sets.
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "../src/index.js";
import { fillStarter } from "./starters.js";

const names = ["INGT_SRC", "INGT_FORMAT"];
const saved = new Map<string, string | undefined>();
const folders: string[] = [];

/** A starter, with its flow's source and its files' `format` as given. */
function workspace(
  source: string,
  format: string,
  files: Record<string, string> = {},
  starter = "duckdb",
) {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-env-unset-"));
  folders.push(folder);
  cpSync(join(import.meta.dirname, "../../core/project-templates", starter), folder, {
    recursive: true,
    filter: (path) => !path.includes("/build"),
  });
  fillStarter(folder, starter);
  writeFileSync(
    join(folder, "flows/orders.yaml"),
    [
      "apiVersion: ingestron.io/v1",
      "kind: Flow",
      "id: orders",
      `source: ${source}`,
      "ingest:",
      `  with: { format: "${format}" }`,
      "tables:",
      "  orders: { object: orders.csv, contract: shop.orders }",
      "",
    ].join("\n"),
  );
  for (const [file, text] of Object.entries(files)) writeFileSync(join(folder, file), text);
  return folder;
}

const fromEnv = (files: Record<string, string> = {}) =>
  workspace("${envvar:INGT_SRC}", "${envvar:INGT_FORMAT}", files);

function ingestron(cwd: string, ...args: string[]) {
  let output = "";
  const code = run(args, { cwd, write: (text) => (output += text) });
  return { code, output };
}

/** Every generated file under the build folder, by path. */
function generated(folder: string): Record<string, string> {
  const build = join(folder, "build");
  return Object.fromEntries(
    readdirSync(build, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name))
      .sort()
      .map((path) => [path.slice(build.length), readFileSync(path, "utf8")]),
  );
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

describe("ingestron and an unset variable in a flow's source and settings", () => {
  it("stops apply with an ENVVAR_MISSING error for each, and nothing else", () => {
    const { code, output } = ingestron(fromEnv(), "apply");
    expect(code).not.toBe(0);
    expect(output.match(/error\s+ENVVAR_MISSING/g)).toHaveLength(2);
    expect(output).not.toMatch(/PACK_CHECK|BAD_SETTING|BROKEN_LINK|information/);
  });

  it("generates from .env.dev exactly what the values written in place generate", () => {
    const folder = fromEnv({ ".env.dev": "INGT_SRC=shop\nINGT_FORMAT=csv\n" });
    const applied = ingestron(folder, "apply");
    expect(applied.code, applied.output).toBe(0);
    const written = workspace("shop", "csv");
    expect(ingestron(written, "apply").code).toBe(0);
    expect(generated(folder)).toEqual(generated(written));
  });

  it("reports a source or a format from .env that is wrong, as if written in place", () => {
    const source = fromEnv({ ".env.dev": "INGT_SRC=nowhere\nINGT_FORMAT=csv\n" });
    const linked = ingestron(source, "apply");
    expect(linked.code).not.toBe(0);
    expect(linked.output).toMatch(/error\s+BROKEN_LINK/);
    const setting = fromEnv({ ".env.dev": "INGT_SRC=shop\nINGT_FORMAT=sometimes\n" });
    const checked = ingestron(setting, "apply");
    expect(checked.code).not.toBe(0);
    expect(checked.output).toMatch(/error\s+BAD_SETTING/);
    expect(checked.output).toContain('"sometimes"');
  });

  it("refuses a flow's source supplied only when deploying, for a pack that builds every environment together", () => {
    const folder = workspace(
      "${envvar:INGT_SRC}",
      "csv",
      { ".env.dev": "INGT_SRC=shop\n" },
      "minimal",
    );
    const { code, output } = ingestron(folder, "apply");
    expect(code).toBe(1);
    expect(output).toMatch(/flows\/orders\.yaml:4:\d+ {2}error {2}DEPLOY_VALUE/);
    expect(output).not.toContain("ENVVAR_MISSING");
  });
});
