// The CLI still stops at an unset ${envvar:…} in a flow's source or settings, and a value
// from .env is used as if it were written in place.
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "../src/index.js";

const names = ["INGT_SRC", "INGT_CLUSTER"];
const saved = new Map<string, string | undefined>();
const folders: string[] = [];

/** The minimal Databricks starter, with its flow's source and `cluster_by` as given. */
function workspace(source: string, clusterBy: string, files: Record<string, string> = {}) {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-env-unset-"));
  folders.push(folder);
  cpSync(join(import.meta.dirname, "../project-templates/minimal"), folder, {
    recursive: true,
    filter: (path) => !path.includes("/build"),
  });
  writeFileSync(
    join(folder, "flows/orders.yaml"),
    [
      "apiVersion: ingestron.io/v1",
      "kind: Flow",
      "id: orders",
      `source: ${source}`,
      "store:",
      `  with: { cluster_by: "${clusterBy}" }`,
      "tables:",
      "  orders: { object: orders, contract: shop.orders }",
      "",
    ].join("\n"),
  );
  for (const [file, text] of Object.entries(files)) writeFileSync(join(folder, file), text);
  return folder;
}

const fromEnv = (files: Record<string, string> = {}) =>
  workspace("${envvar:INGT_SRC}", "${envvar:INGT_CLUSTER}", files);

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
    const { code, output } = ingestron(fromEnv(), "apply", "--env", "dev");
    expect(code).not.toBe(0);
    expect(output.match(/error\s+ENVVAR_MISSING/g)).toHaveLength(2);
    expect(output).not.toMatch(/PACK_CHECK|BAD_SETTING|BROKEN_LINK|information/);
  });

  it("generates from .env.dev exactly what the values written in place generate", () => {
    const folder = fromEnv({ ".env.dev": "INGT_SRC=shop\nINGT_CLUSTER=none\n" });
    const applied = ingestron(folder, "apply", "--env", "dev");
    expect(applied.code, applied.output).toBe(0);
    const written = workspace("shop", "none");
    expect(ingestron(written, "apply", "--env", "dev").code).toBe(0);
    expect(generated(folder)).toEqual(generated(written));
  });

  it("reports a source or a cluster_by from .env that is wrong, as if written in place", () => {
    const source = fromEnv({ ".env.dev": "INGT_SRC=nowhere\nINGT_CLUSTER=none\n" });
    const linked = ingestron(source, "apply", "--env", "dev");
    expect(linked.code).not.toBe(0);
    expect(linked.output).toMatch(/error\s+BROKEN_LINK/);
    const setting = fromEnv({ ".env.dev": "INGT_SRC=shop\nINGT_CLUSTER=sometimes\n" });
    const checked = ingestron(setting, "apply", "--env", "dev");
    expect(checked.code).not.toBe(0);
    expect(checked.output).toMatch(/error\s+BAD_SETTING/);
    expect(checked.output).toContain('"sometimes"');
  });
});
