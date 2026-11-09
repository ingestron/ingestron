// The standard cases in spec/cli/conformance/standard/cases.json: each runs in a new project
// made from a kit and committed to git, with the catalogue unreachable (spec/cli/kits.md).
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { committed, ingestron, offlineCatalogue, temp } from "./kit-catalogue.js";

interface Case {
  name: string;
  args: string[];
  change?: { file: string; append: string };
  exit: number;
  output?: string;
  outputStarts?: string;
}

const file = join(import.meta.dirname, "../../../spec/cli/conformance/standard/cases.json");
const { project, cases } = JSON.parse(readFileSync(file, "utf8")) as {
  project: { args: string[]; folder: string };
  cases: Case[];
};

offlineCatalogue();

describe("standard conformance", () => {
  for (const testCase of cases)
    it(testCase.name, () => {
      const cwd = temp();
      const made = ingestron(cwd, ...project.args);
      expect(made.code, made.output).toBe(0);
      const folder = join(cwd, project.folder);
      committed(folder);
      if (testCase.change)
        appendFileSync(join(folder, testCase.change.file), testCase.change.append);
      const { code, output } = ingestron(folder, ...testCase.args);
      expect(code, output).toBe(testCase.exit);
      if (testCase.output !== undefined) expect(output).toBe(testCase.output);
      if (testCase.outputStarts !== undefined)
        expect(output.startsWith(testCase.outputStarts), output).toBe(true);
    });
});
