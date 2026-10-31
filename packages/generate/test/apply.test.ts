// Applying: refusals, the lock, changes after planning, and rollback.
import { describe, expect, it } from "vitest";
import {
  applyPlan,
  lockFile,
  memoryFolder,
  planGeneration,
  type OutputFolder,
} from "../src/index.js";

const wanted = { "a.yml": "a: 2\n", "b.yml": "b: 1\n" };

describe("applyPlan", () => {
  it("refuses a plan with conflicts and changes nothing", () => {
    const output = memoryFolder({ "a.yml": "written by a person\n" });
    const result = applyPlan(output, planGeneration(output, wanted));
    expect(result.problems.map((problem) => problem.code)).toEqual(["PLAN_HAS_CONFLICTS"]);
    expect(output.snapshot()).toEqual({ "a.yml": "written by a person\n" });
  });

  it("refuses while another generation holds the lock", () => {
    const output = memoryFolder({ [lockFile]: "" });
    const result = applyPlan(output, planGeneration(output, wanted));
    expect(result.problems.map((problem) => problem.code)).toEqual(["LOCKED"]);
    expect(output.snapshot()).toEqual({ [lockFile]: "" });
  });

  it("refuses when a file changed after planning, before writing anything", () => {
    const output = memoryFolder({});
    const plan = planGeneration(output, wanted);
    output.write("b.yml", "b: written meanwhile\n");
    const result = applyPlan(output, plan);
    expect(result.problems).toMatchObject([{ code: "CHANGED_SINCE_PLAN", path: "b.yml" }]);
    expect(output.snapshot()).toEqual({ "b.yml": "b: written meanwhile\n" });
  });

  it("restores every file and the manifest when a write fails", () => {
    const first = memoryFolder({});
    applyPlan(first, planGeneration(first, { "a.yml": "a: 1\n", "old.yml": "old\n" }));
    const before = first.snapshot();
    const failing: OutputFolder = {
      ...first,
      write(path, content) {
        if (path === "b.yml") throw new Error("disk full");
        first.write(path, content);
      },
    };
    const result = applyPlan(failing, planGeneration(failing, wanted));
    expect(result.problems).toMatchObject([{ code: "WRITE_FAILED", path: "b.yml" }]);
    expect(result.problems[0]?.message).toContain("Nothing was changed.");
    expect(first.snapshot()).toEqual(before);
  });

  it("says so when a file cannot be put back", () => {
    const first = memoryFolder({});
    applyPlan(first, planGeneration(first, { "a.yml": "a: 1\n" }));
    let restoring = false;
    const failing: OutputFolder = {
      ...first,
      write(path, content) {
        if (path === "b.yml") {
          restoring = true;
          throw new Error("disk full");
        }
        if (restoring) throw new Error("disk full");
        first.write(path, content);
      },
    };
    const result = applyPlan(failing, planGeneration(failing, wanted));
    expect(result.problems[0]?.message).toContain("Some files could not be put back.");
    expect(first.read("a.yml")).toEqual({ kind: "file", content: "a: 2\n" });
  });

  it("removes the lock after success and after failure", () => {
    const output = memoryFolder({});
    applyPlan(output, planGeneration(output, wanted));
    expect(output.read(lockFile)).toEqual({ kind: "absent" });
  });
});
