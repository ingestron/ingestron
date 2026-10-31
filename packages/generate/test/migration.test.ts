// Manifests written before the package moved must keep working unchanged.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as generate from "../src/index.js";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/pre-extraction.json", import.meta.url), "utf8"),
) as { wanted: Record<string, string>; files: Record<string, string> };

describe("manifests from earlier versions", () => {
  it("accepts a manifest produced before extraction without rewriting it", () => {
    const folder = generate.memoryFolder(fixture.files);
    expect(generate.planGeneration(folder, fixture.wanted).upToDate).toBe(true);
    expect(generate.applyPlan(folder, generate.planGeneration(folder, fixture.wanted)).ok).toBe(
      true,
    );
    expect(folder.snapshot()).toEqual(fixture.files);
  });

  it("retains hand edits and honours the existing lock", () => {
    const edited = generate.memoryFolder({
      ...fixture.files,
      "jobs/example.yaml": "hand edited\n",
    });
    const plan = generate.planGeneration(edited, fixture.wanted);
    expect(plan.clean).toBe(false);
    expect(generate.applyPlan(edited, plan).ok).toBe(false);
    expect(edited.read("jobs/example.yaml")).toEqual({ kind: "file", content: "hand edited\n" });
    const locked = generate.memoryFolder({
      ...fixture.files,
      [generate.lockFile]: "existing lock",
    });
    const result = generate.applyPlan(locked, generate.planGeneration(locked, fixture.wanted));
    expect(result.problems.map((problem) => problem.code)).toEqual(["LOCKED"]);
  });
});
