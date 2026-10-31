// An environment can name the pack it runs on, such as duckdb for local runs.
import { describe, expect, it } from "vitest";
import { memoryFiles, resolveProject } from "../src/index.js";

const manifest = (local: string) =>
  ["id: sales", "environments:", `  local: ${local}`, "  prod: {}", 'imports: ["*.yaml"]', ""].join(
    "\n",
  );

function load(local: string, environment: string) {
  return resolveProject(memoryFiles({ "project.yaml": manifest(local) }), {
    kinds: [],
    environment,
  });
}

describe("runs-on", () => {
  it("is read for the selected environment", () => {
    const result = load("{ runs-on: duckdb }", "local");
    // The test manifest imports no documents; only that may be reported.
    expect(result.diagnostics.map(({ code }) => code)).toEqual(["NO_MATCH"]);
    expect(result.project?.runsOn).toBe("duckdb");
  });

  it("is absent for an environment that does not name one", () => {
    expect(load("{ runs-on: duckdb }", "prod").project?.runsOn).toBeUndefined();
  });

  it("names a pack", () => {
    expect(load("{ runs-on: 3 }", "local").diagnostics.map(({ code }) => code)).toContain("SCHEMA");
  });
});
