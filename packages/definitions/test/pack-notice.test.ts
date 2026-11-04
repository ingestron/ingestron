// A pack's notices (specification section 2.1): what the people deploying the files need
// to know, returned with a pack's problems and shown as warnings when generating. The
// diagnostics they become are conformance case 93.
import { describe, expect, it } from "vitest";
import {
  codeHelp,
  environmentsDiagnostics,
  type EnvironmentsBuild,
  type EnvironmentsProblem,
  type PackNotice,
} from "../src/index.js";

describe("a pack's notices", () => {
  it("are returned beside a pack's problems, and read by narrowing on the code", () => {
    const problems: EnvironmentsProblem[] = [
      { code: "SECRET_NAME_DIFFERS", severity: "warning", message: "A.", file: "a.yaml" },
    ];
    const notice: PackNotice = {
      code: "PACK_NOTICE",
      severity: "warning",
      message: "The runtimes are written with their name and type only.",
      hint: "Check their other settings before the first deploy.",
    };
    const built: EnvironmentsBuild = {
      files: {},
      deployValues: [],
      problems: [...problems, notice],
    };
    const files = built.problems.map((problem) =>
      problem.code === "PACK_NOTICE" ? (problem.file ?? "") : problem.file,
    );
    expect(files).toEqual(["a.yaml", ""]);
    expect(codeHelp.PACK_NOTICE.meaning).toMatch(/A warning: the files are still written\./);
  });

  it("stay warnings when a pack written in JavaScript gives them as errors", () => {
    const given = { code: "PACK_NOTICE", severity: "error", message: "A.", hint: "B." };
    const [diagnostic] = environmentsDiagnostics([given as unknown as PackNotice]);
    expect(diagnostic?.severity).toBe("warning");
  });
});
