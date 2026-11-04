// Runs the language-neutral cases in spec/cli/conformance/outputs/ with the
// stand-in packs: where plan, apply and check put each output folder.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { readArgs, usage } from "../src/args.js";
import { generate } from "../src/generate.js";
import { generatedFolders } from "../src/outputs.js";
import { standInPacks } from "./outputs-packs.js";

interface Case {
  description: string;
  files: Record<string, string>;
  envvars?: Record<string, string>;
  command: "plan" | "apply" | "check";
  args?: string[];
  expect: {
    exit: number;
    lines?: string[];
    diagnostics?: Record<string, unknown>[];
    folders?: Record<string, string[]>;
    texts?: Record<string, string>;
  };
}

const cases = join(import.meta.dirname, "../../../spec/cli/conformance/outputs");

/** Runs the case's command in a folder holding its files; the exit code and the output. */
function runCase(testCase: Case): { folder: string; exit: number; output: string } {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-outputs-"));
  for (const [path, text] of Object.entries(testCase.files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    writeFileSync(join(folder, path), text);
  }
  let output = "";
  const io = { cwd: folder, write: (text: string) => (output += text) };
  const args = [testCase.command, ...(testCase.args ?? []), "--definitions", ".", "--out", "build"];
  const saved = { ...process.env };
  Object.assign(process.env, testCase.envvars ?? {});
  try {
    const options = readArgs(args);
    if (options === "help" || "mistake" in options) {
      output = `${options === "help" ? "" : options.mistake}\n\n${usage}`;
      return { folder, exit: 2, output };
    }
    return { folder, exit: generate(options, io, standInPacks), output };
  } finally {
    for (const name of Object.keys(testCase.envvars ?? {}))
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
  }
}

/** The lines expected, in order, with any others between them. */
function checkLines(output: string, lines: string[]): void {
  const found = output.split("\n");
  let at = 0;
  for (const line of lines) {
    const index = found.indexOf(line, at);
    expect(index, `"${line}" after line ${at} of:\n${output}`).toBeGreaterThanOrEqual(0);
    at = index + 1;
  }
}

/** Each diagnostic the output shows: its heading's fields and its indented text. */
function diagnosticsShown(output: string): Record<string, unknown>[] {
  const shown: Record<string, unknown>[] = [];
  for (const line of output.split("\n")) {
    const heading =
      /^(?:(.+):(\d+):(\d+)|\(project\)) {2}(error|warning|information) {2}(\S+)$/.exec(line);
    if (heading) {
      const [, file, at, column, severity, code] = heading;
      const where = file ? { file, line: Number(at), column: Number(column) } : {};
      shown.push({ code, severity, ...where, text: [] as string[] });
    } else if (line.startsWith("  ") && shown.length > 0)
      (shown.at(-1)!.text as string[]).push(line.slice(2));
  }
  return shown;
}

function checkDiagnostics(output: string, wanted: Record<string, unknown>[]): void {
  const shown = diagnosticsShown(output);
  expect(shown, output).toHaveLength(wanted.length);
  wanted.forEach(({ message, hint, ...fields }, index) => {
    const { text, ...found } = shown[index]!;
    expect(found).toMatchObject(fields);
    const lines = (text as string[]).join("\n");
    if (message !== undefined) expect(lines.startsWith(String(message)), lines).toBe(true);
    if (hint !== undefined) expect(lines).toContain(String(hint));
  });
}

/** Every folder under build/ with a manifest, and the files its manifest lists. */
function foldersAfter(folder: string): Record<string, string[]> {
  return Object.fromEntries(
    generatedFolders(join(folder, "build")).map((found) => {
      const manifest = JSON.parse(readFileSync(join(found, ".generated.json"), "utf8")) as {
        files: Record<string, string>;
      };
      return [relative(folder, found).split(sep).join("/"), Object.keys(manifest.files).sort()];
    }),
  );
}

describe("output folder conformance", () => {
  const names = readdirSync(cases)
    .filter((name) => name.endsWith(".yaml"))
    .sort();
  it("has the cases", () => expect(names.length).toBeGreaterThanOrEqual(12));
  for (const name of names) {
    const testCase = parse(readFileSync(join(cases, name), "utf8")) as Case;
    it(`${name}: ${testCase.description}`, () => {
      const { folder, exit, output } = runCase(testCase);
      const wanted = testCase.expect;
      expect(exit, output).toBe(wanted.exit);
      if (wanted.lines) checkLines(output, wanted.lines);
      if (wanted.diagnostics) checkDiagnostics(output, wanted.diagnostics);
      if (wanted.folders) {
        const sorted = Object.entries(wanted.folders).map(([key, list]) => [key, [...list].sort()]);
        expect(foldersAfter(folder)).toEqual(Object.fromEntries(sorted));
      }
      for (const [path, text] of Object.entries(wanted.texts ?? {}))
        expect(readFileSync(join(folder, path), "utf8"), path).toBe(text);
    });
  }
});
