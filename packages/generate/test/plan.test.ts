// Planning details the conformance cases cannot express.
import { describe, expect, it } from "vitest";
import { applyPlan, formatPlan, manifestFile, memoryFolder, planGeneration } from "../src/index.js";

describe("planGeneration", () => {
  it("treats a folder or link at a wanted path as a conflict", () => {
    const output = memoryFolder({}, { others: ["jobs"] });
    const plan = planGeneration(output, { jobs: "x\n" });
    expect(plan.changes).toMatchObject([
      { path: "jobs", change: "conflict", reason: "NOT_A_FILE" },
    ]);
  });

  it("reports a manifest that is not valid instead of guessing", () => {
    const output = memoryFolder({ [manifestFile]: "{ not json" });
    const plan = planGeneration(output, { "a.yml": "a\n" });
    expect(plan.problems.map((problem) => problem.code)).toEqual(["BAD_MANIFEST"]);
    expect(plan.clean).toBe(false);
  });

  it("refuses a manifest that lists a path outside the folder, so it is never deleted", () => {
    const manifest = JSON.stringify({ version: 1, files: { "../x.yml": "sha256:00" } });
    const plan = planGeneration(memoryFolder({ [manifestFile]: manifest }), {});
    expect(plan.problems).toMatchObject([{ code: "BAD_MANIFEST" }]);
    expect(plan.changes).toEqual([]);
  });

  it("shows a line diff for each update", () => {
    const output = memoryFolder({});
    applyPlan(output, planGeneration(output, { "a.yml": "name: a\nretries: 1\n" }));
    const plan = planGeneration(output, { "a.yml": "name: a\nretries: 2\n" });
    expect(plan.changes).toMatchObject([
      { change: "update", diff: "@@ -1,2 +1,2 @@\n name: a\n-retries: 1\n+retries: 2" },
    ]);
  });
});

describe("unusual paths and later changes", () => {
  it("handles files named like object properties or problem fields", () => {
    const output = memoryFolder({});
    // JSON.parse, because an object literal treats "__proto__" specially.
    const names = JSON.parse('{"code":"c\\n","constructor":"k\\n","__proto__":"p\\n"}');
    expect(applyPlan(output, planGeneration(output, names)).ok).toBe(true);
    expect(planGeneration(output, names).upToDate).toBe(true);
    expect(planGeneration(output, {}).changes.map((change) => change.change)).toEqual([
      "delete",
      "delete",
      "delete",
    ]);
  });

  it("writes what was planned even if the caller changes its object afterwards", () => {
    const output = memoryFolder({});
    const wanted: Record<string, string> = { "a.yml": "planned\n" };
    const plan = planGeneration(output, wanted);
    wanted["a.yml"] = "changed later\n";
    applyPlan(output, plan);
    expect(output.read("a.yml")).toEqual({ kind: "file", content: "planned\n" });
  });
});

describe("formatPlan", () => {
  it("lists each change, explains conflicts and sums up", () => {
    const output = memoryFolder({ "notes.md": "mine\n" });
    const text = formatPlan(planGeneration(output, { "a.yml": "a\n", "notes.md": "generated\n" }));
    expect(text).toBe(
      [
        "create    a.yml",
        "conflict  notes.md",
        "          Exists but was not generated. Move or delete it, or stop generating it.",
        "",
        "2 files: 1 create, 1 conflict. Resolve the conflicts before applying.",
      ].join("\n"),
    );
  });
});
