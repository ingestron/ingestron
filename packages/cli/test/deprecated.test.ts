// What moved to @ingestron/core is still exported here, for one major version:
// the very same values, so code that imports them from here works unchanged.
import * as core from "@ingestron/core";
import { describe, expect, it } from "vitest";
import * as cli from "../src/index.js";

const moved = [
  "builtInTemplates",
  "compareEnvironments",
  "contractFromSample",
  "generatedOutputs",
  "listSamples",
  "nameProblem",
  "packs",
  "parseTemplate",
  "platformRequest",
  "projectId",
  "projectRecipe",
  "projectRoutes",
  "projectSources",
  "readSample",
  "sampleFacts",
  "templateSchema",
  "templatesFolder",
] as const;

describe("exports that moved to @ingestron/core", () => {
  for (const name of moved)
    it(`${name} is the same value from cli and core`, () => {
      expect(cli[name]).toBe(core[name]);
    });

  it("are the cli's only exports besides the command's own", () => {
    expect(Object.keys(cli).sort()).toEqual([...moved, "commands", "flags", "run"].sort());
  });
});
