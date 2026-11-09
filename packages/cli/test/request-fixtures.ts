// A synthetic project for the platform request tests: the minimal Databricks starter with
// one variable unset and one set in .env.dev, in a temporary folder.
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach } from "vitest";
import { run } from "../src/index.js";

const names = [
  "INGT_REQ_LANDING",
  "INGT_REQ_FOLDER",
  "INGT_REQ_SOURCE",
  "P_PREFIX",
  "P_SUFFIX",
  "P_CONTRACT",
];
export const folderValue = "synthetic-folder-7f3a";
const saved = new Map<string, string | undefined>();
const folders: string[] = [];

/** The minimal Databricks starter, with its files replaced or added as given. */
export function workspace(files: Record<string, string> = {}): string {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-request-"));
  folders.push(folder);
  cpSync(join(import.meta.dirname, "../../core/project-templates/minimal"), folder, {
    recursive: true,
    filter: (path) => !path.includes("/build"),
  });
  for (const [file, text] of Object.entries(files)) writeFileSync(join(folder, file), text);
  return folder;
}

/** project.yaml, with `values.landing` from an unset variable. */
export const project = [
  "id: shop",
  "values:",
  "  landing: ${envvar:INGT_REQ_LANDING}",
  "environments:",
  "  dev: {}",
  "imports: [standard.yaml, connections/*.yaml, flows/*.yaml, contracts/*.yaml]",
  "",
].join("\n");

/** The connection, whose path reads one more variable. */
const connection = [
  "apiVersion: ingestron.io/v1",
  "kind: Connection",
  "id: shop",
  "connector: files",
  "connectivity: public",
  "settings:",
  "  path: ${values.landing}/${envvar:INGT_REQ_FOLDER}",
  "",
].join("\n");

/** One variable unset, and one set in .env.dev. */
export const withVariables = () =>
  workspace({
    "project.yaml": project,
    "connections/shop.yaml": connection,
    ".env.dev": `INGT_REQ_FOLDER=${folderValue}\n`,
  });

/** Runs the command line in `cwd`. */
export function ingestron(cwd: string, ...args: string[]) {
  let output = "";
  const code = run(args, { cwd, write: (text) => (output += text) });
  return { code, output };
}

/** The text of one `##` section, up to the next. */
export function section(output: string, title: string): string {
  const start = output.indexOf(`## ${title}\n`);
  if (start === -1) return "";
  const end = output.indexOf("\n## ", start + 1);
  return output.slice(start, end === -1 ? undefined : end);
}

/** Clears the variables the tests use before each test, and restores them and removes the folders after. */
export function cleanUp(): void {
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
}
