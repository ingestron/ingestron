// Runs the language-neutral cases in spec/generate/conformance/.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { applyPlan, digestOf, manifestFile, memoryFolder, planGeneration } from "../src/index.js";

interface Case {
  description: string;
  disk: Record<string, string>;
  manifest?: Record<string, string>;
  wanted: Record<string, string>;
  expect: {
    changes?: { path: string; change: string; reason?: string }[];
    problems?: { code: string; path?: string }[];
    clean: boolean;
    upToDate: boolean;
    disk?: Record<string, string>;
  };
}

const folder = join(import.meta.dirname, "../../../spec/generate/conformance");

function startingFiles(testCase: Case): Record<string, string> {
  if (!testCase.manifest) return { ...testCase.disk };
  const files = Object.fromEntries(
    Object.entries(testCase.manifest).map(([path, content]) => [path, digestOf(content)]),
  );
  return { ...testCase.disk, [manifestFile]: JSON.stringify({ version: 1, files }) };
}

describe("conformance", () => {
  for (const name of readdirSync(folder).sort()) {
    const testCase = parse(readFileSync(join(folder, name), "utf8")) as Case;
    it(`${name}: ${testCase.description}`, () => {
      const output = memoryFolder(startingFiles(testCase));
      const plan = planGeneration(output, testCase.wanted);
      if (testCase.expect.changes) {
        expect(
          plan.changes.map(({ path, change, reason }) => ({
            path,
            change,
            ...(reason && { reason }),
          })),
        ).toEqual(testCase.expect.changes);
      }
      if (testCase.expect.problems) {
        expect(plan.problems.map(({ code, path }) => ({ code, path }))).toEqual(
          testCase.expect.problems,
        );
      }
      expect(plan.clean).toBe(testCase.expect.clean);
      expect(plan.upToDate).toBe(testCase.expect.upToDate);
      if (testCase.expect.disk) {
        expect(applyPlan(output, plan).ok).toBe(true);
        const { [manifestFile]: manifest, ...files } = output.snapshot();
        expect(files).toEqual(testCase.expect.disk);
        expect(Object.keys(JSON.parse(manifest ?? "{}").files)).toEqual(
          Object.keys(testCase.wanted).sort(),
        );
        expect(planGeneration(output, testCase.wanted).upToDate).toBe(true);
      }
    });
  }
});
