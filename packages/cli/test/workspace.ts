// A copy of a starter or fixture to work in, and the CLI run there, for the tests of
// what a user meets.
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/index.js";
import { fillStarter } from "./starters.js";

const packageFolder = join(import.meta.dirname, "..");

/**
 * A copy of `example` (a starter's name, or a path under the package such as
 * `test/fixtures/environments`), `change` made to it, and a function that runs the CLI there.
 */
export function workspace(example = "retail", change: (folder: string) => void = () => {}) {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-outputs-"));
  const from = example.includes("/") ? example : `project-templates/${example}`;
  cpSync(join(packageFolder, from), folder, {
    recursive: true,
    filter: (path) => !path.includes("/build"),
  });
  if (!example.includes("/")) fillStarter(folder, example);
  change(folder);
  const ingestron = (...args: string[]) => {
    let output = "";
    const code = run(args, { cwd: folder, write: (text) => (output += text) });
    return { code, output };
  };
  return { folder, ingestron };
}

/** Replaces text in one of the folder's files. */
export function edit(folder: string, file: string, from: string | RegExp, to: string): void {
  const path = join(folder, file);
  writeFileSync(path, readFileSync(path, "utf8").replace(from, to));
}
