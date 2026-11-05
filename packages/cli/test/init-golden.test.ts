// The init cases in spec/cli/conformance/init/: each runs init on a fixed day and compares
// the files written, exactly (spec/cli/projects.md).
import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/index.js";

interface Case {
  description: string;
  args: string[];
  date: string;
  folder: string;
  exit: number;
  lastLine: string;
}

const cases = join(import.meta.dirname, "../../../spec/cli/conformance/init");

function filesUnder(folder: string, under = folder): string[] {
  return readdirSync(under).flatMap((entry) => {
    const path = join(under, entry);
    return statSync(path).isDirectory() ? filesUnder(folder, path) : [relative(folder, path)];
  });
}

describe("init conformance", () => {
  for (const name of readdirSync(cases).sort()) {
    const testCase = JSON.parse(readFileSync(join(cases, name, "case.json"), "utf8")) as Case;
    it(`${name}: ${testCase.description}`, () => {
      const cwd = mkdtempSync(join(tmpdir(), "ingestron-init-case-"));
      let output = "";
      const code = run(testCase.args, {
        cwd,
        write: (text) => (output += text),
        now: () => new Date(`${testCase.date}T09:00:00Z`),
      });
      expect(code, output).toBe(testCase.exit);
      expect(output.trimEnd().split("\n").at(-1)).toBe(testCase.lastLine);
      const expected = join(cases, name, "files");
      for (const path of filesUnder(expected))
        expect(readFileSync(join(cwd, testCase.folder, path), "utf8"), path).toBe(
          readFileSync(join(expected, path), "utf8"),
        );
    });
  }
});
