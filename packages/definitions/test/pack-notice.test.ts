// A pack's notices (specification section 2.1): what the people deploying the files need
// to know, returned with a pack's problems and shown as warnings when generating.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { codeHelp, environmentsDiagnostics, type Pack, type PackNotice } from "../src/index.js";

const conformance = join(import.meta.dirname, "../../../spec/definitions/conformance");
const fold = parse(readFileSync(join(conformance, "pack-fold.yaml"), "utf8")) as Pack;

describe("a pack's notices", () => {
  const noticing: Pack = {
    ...fold,
    build: () => ({}),
    buildEnvironments: () => ({
      files: { "views.sql": "SELECT 1;\n" },
      deployValues: [{ name: "synapse_source", suppliedAs: ["synapse_source"] }],
      problems: [
        {
          code: "PACK_NOTICE",
          severity: "warning",
          message:
            'The deploying pipeline supplies "synapse_source" under that name, in that case.',
          hint: "Set the variable with exactly that name in every pipeline stage.",
          file: "shop.yaml",
          line: 6,
        },
        {
          code: "PACK_NOTICE",
          severity: "warning",
          message: "The runtimes are written with their name and type only.",
          hint: "Check their other settings before the first deploy.",
        },
      ],
    }),
  };

  it("become warnings with the pack's own hint, located only when the pack names a file", () => {
    const { problems } = noticing.buildEnvironments!({});
    const diagnostics = environmentsDiagnostics(problems);
    expect(diagnostics).toEqual([
      {
        code: "PACK_NOTICE",
        severity: "warning",
        message: 'The deploying pipeline supplies "synapse_source" under that name, in that case.',
        hint: "Set the variable with exactly that name in every pipeline stage.",
        location: { file: "shop.yaml", line: 6, column: 1 },
      },
      {
        code: "PACK_NOTICE",
        severity: "warning",
        message: "The runtimes are written with their name and type only.",
        hint: "Check their other settings before the first deploy.",
      },
    ]);
    expect(diagnostics.some((diagnostic) => diagnostic.severity === "error")).toBe(false);
    expect(codeHelp.PACK_NOTICE.meaning).toMatch(/A warning: the files are still written\./);
  });

  it("stay warnings when a pack written in JavaScript gives them as errors", () => {
    const given = { code: "PACK_NOTICE", severity: "error", message: "A.", hint: "B." };
    const [diagnostic] = environmentsDiagnostics([given as unknown as PackNotice]);
    expect(diagnostic?.severity).toBe("warning");
  });
});
