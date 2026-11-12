// Runs the language-neutral cases in spec/cli/conformance/assistants/ (spec/cli/assistants.md,
// section 7): `init` and `assistant add` with the CLI's real packs, `plan`, `apply` and `check`
// with the stand-in packs of the output folder cases.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { run } from "../src/index.js";
import { checkBlock, checkLines } from "./conformance-checks.js";
import { runWithStandIns, withEnvironment } from "./assistant-helpers.js";

interface Case {
  description: string;
  files?: Record<string, string>;
  envvars?: Record<string, string>;
  command: "init" | "assistant" | "plan" | "apply" | "check";
  args?: string[];
  expect: {
    exit: number;
    lines?: string[];
    block?: string[];
    contains?: Record<string, string[]>;
    absent?: Record<string, string[] | null>;
    absentLines?: string[];
    unchanged?: string[];
  };
}

const cases = join(import.meta.dirname, "../../../spec/cli/conformance/assistants");
/** The keys of `expect` that spec/cli/assistants.md, section 7, defines. */
const keys = ["exit", "lines", "block", "contains", "absent", "absentLines", "unchanged"];

/** Runs the case's command in a folder that is the working folder and the project folder. */
function runCase(testCase: Case): { folder: string; exit: number; output: string } {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-assistants-"));
  // For init the case's files are left out: it runs in an empty folder.
  const files = testCase.command === "init" ? {} : (testCase.files ?? {});
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    writeFileSync(join(folder, path), text);
  }
  const rest = testCase.args ?? [];
  const args =
    testCase.command === "init"
      ? ["init", ...rest]
      : [testCase.command, ...rest, "--definitions", ".", "--out", "build"];
  let output = "";
  const io = {
    cwd: folder,
    write: (text: string) => (output += text),
    now: () => new Date("2026-11-13T09:00:00Z"),
  };
  return withEnvironment(testCase.envvars, () => {
    // plan, apply and check run with the stand-in packs, as the output folder cases do.
    if (testCase.command === "plan" || testCase.command === "apply" || testCase.command === "check")
      return { folder, ...runWithStandIns(args, folder) };
    return { folder, exit: run(args, io), output };
  });
}

const read = (folder: string, path: string) => readFileSync(join(folder, path), "utf8");

type Expect = Case["expect"];

/** What the output must show: its lines, its block and the texts no line has. */
function checkOutput(output: string, wanted: Expect): void {
  if (wanted.lines) checkLines(output, wanted.lines);
  if (wanted.block) checkBlock(output, wanted.block);
  for (const text of wanted.absentLines ?? [])
    for (const line of output.split("\n")) expect(line, output).not.toContain(text);
}

/** The text of a file, or nothing when there is none. */
const textOf = (folder: string, path: string) =>
  existsSync(join(folder, path)) ? read(folder, path) : "";

/** What the files must hold after the command: texts, no file, texts not there, and bytes kept. */
function checkFiles(folder: string, { files, expect: wanted }: Case): void {
  for (const [path, texts] of Object.entries(wanted.contains ?? {}))
    for (const text of texts) expect(read(folder, path), path).toContain(text);
  for (const [path, texts] of Object.entries(wanted.absent ?? {})) {
    if (texts === null) expect(existsSync(join(folder, path)), `${path} exists`).toBe(false);
    else for (const text of texts) expect(textOf(folder, path), path).not.toContain(text);
  }
  for (const path of wanted.unchanged ?? []) expect(read(folder, path), path).toBe(files![path]);
}

describe("assistant guide conformance", () => {
  const names = readdirSync(cases)
    .filter((name) => name.endsWith(".yaml"))
    .sort();
  it("has the cases", () => expect(names.length).toBeGreaterThanOrEqual(18));
  for (const name of names) {
    const testCase = parse(readFileSync(join(cases, name), "utf8")) as Case;
    it(`${name}: ${testCase.description}`, () => {
      expect(Object.keys(testCase.expect).filter((key) => !keys.includes(key))).toEqual([]);
      const { folder, exit, output } = runCase(testCase);
      expect(exit, output).toBe(testCase.expect.exit);
      checkOutput(output, testCase.expect);
      checkFiles(folder, testCase);
    });
  }
});
