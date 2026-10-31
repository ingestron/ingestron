// The Node output folder: real files, links, the lock and folder clean-up.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyPlan, nodeFolder, planGeneration } from "../src/index.js";

function temporaryFolder(): string {
  return mkdtempSync(join(tmpdir(), "generate-"));
}

describe("nodeFolder", () => {
  it("writes files and folders, and leaves no temporary files", () => {
    const root = temporaryFolder();
    const output = nodeFolder(root);
    const result = applyPlan(
      output,
      planGeneration(output, { "jobs/orders.yml": "name: orders\n" }),
    );
    expect(result.ok).toBe(true);
    expect(readFileSync(join(root, "jobs/orders.yml"), "utf8")).toBe("name: orders\n");
    expect(readdirSync(join(root, "jobs"))).toEqual(["orders.yml"]);
    expect(readdirSync(root).sort()).toEqual([".generated.json", "jobs"]);
  });

  it("creates the output folder when it does not exist yet", () => {
    const root = join(temporaryFolder(), "build", "bundle");
    const output = nodeFolder(root);
    expect(applyPlan(output, planGeneration(output, { "a.yml": "a\n" })).ok).toBe(true);
    expect(readFileSync(join(root, "a.yml"), "utf8")).toBe("a\n");
  });

  it("removes folders left empty by a delete", () => {
    const root = temporaryFolder();
    const output = nodeFolder(root);
    applyPlan(output, planGeneration(output, { "jobs/old/x.yml": "x\n", "keep.yml": "k\n" }));
    applyPlan(output, planGeneration(output, { "keep.yml": "k\n" }));
    expect(existsSync(join(root, "jobs"))).toBe(false);
  });

  it("treats a symbolic link as not a file, so it is never followed or replaced", () => {
    const root = temporaryFolder();
    const outside = temporaryFolder();
    writeFileSync(join(outside, "target.yml"), "outside\n");
    symlinkSync(join(outside, "target.yml"), join(root, "a.yml"));
    const plan = planGeneration(nodeFolder(root), { "a.yml": "a\n" });
    expect(plan.changes).toMatchObject([{ change: "conflict", reason: "NOT_A_FILE" }]);
  });

  it("refuses to write through a linked folder that leads outside", () => {
    const root = temporaryFolder();
    const outside = temporaryFolder();
    symlinkSync(outside, join(root, "jobs"));
    const output = nodeFolder(root);
    const result = applyPlan(output, planGeneration(output, { "jobs/x.yml": "x\n" }));
    expect(result.ok).toBe(false);
    expect(readdirSync(outside)).toEqual([]);
  });

  it("creates no folders through a linked folder that leads outside", () => {
    const root = temporaryFolder();
    const outside = temporaryFolder();
    symlinkSync(outside, join(root, "linked"));
    const output = nodeFolder(root);
    const result = applyPlan(output, planGeneration(output, { "linked/new/nested/a.txt": "a\n" }));
    expect(result.ok).toBe(false);
    expect(result.problems[0]?.message).toContain("Nothing was changed.");
    expect(readdirSync(outside)).toEqual([]);
  });

  it("holds the lock exclusively", () => {
    const root = temporaryFolder();
    mkdirSync(root, { recursive: true });
    const first = nodeFolder(root);
    expect(first.lock()).toBe(true);
    expect(nodeFolder(root).lock()).toBe(false);
    first.unlock();
    expect(nodeFolder(root).lock()).toBe(true);
  });
});
