// Project, as a tool built on it relies on: the packs it is given reach every
// section of the request, it keeps host values out of what it shows, it reuses
// its generation, and it says plainly when the definitions have problems.
import { inspect } from "node:util";
import { join } from "node:path";
import { memoryFiles, nodeFiles, type FileSource } from "@ingestron/config";
import type { Pack } from "@ingestron/definitions";
import { memoryFolder } from "@ingestron/generate";
import { describe, expect, it } from "vitest";
import { packs, platformRequest, Project } from "../../src/index.js";

const platformSetup = join(import.meta.dirname, "../../../cli/test/fixtures/platform-setup");

/** The built-in packs, each marking the SQL it writes to run once. */
const marked: Pack[] = packs.map((pack) => ({
  ...pack,
  build: (model) =>
    Object.fromEntries(
      Object.entries(pack.build(model)).map(([path, text]) => [
        path,
        /^prerequisites(\.sql|\/)/.test(path) ? `-- marked\n${text}` : text,
      ]),
    ),
}));

/** `files`, counting every read. */
function counted(files: FileSource): { files: FileSource; reads: () => number } {
  let reads = 0;
  return {
    files: { list: () => files.list(), read: (path) => ((reads += 1), files.read(path)) },
    reads: () => reads,
  };
}

describe("Project, for tools built on it", () => {
  it("uses the packs it is given for the request's SQL to run once", () => {
    const project = Project.open(nodeFiles(platformSetup), { packs: marked, envvars: {} });
    expect(project.request("dev")).toContain("-- marked");
  });

  it("never shows the host values it holds", () => {
    const project = Project.open(memoryFiles({}), {
      envvars: { DATABRICKS_TOKEN: "dapi-secret-1234" },
    });
    expect(inspect(project, { depth: 10 })).not.toContain("dapi-secret-1234");
    expect(JSON.stringify(project)).not.toContain("dapi-secret-1234");
  });

  it("writes the request from the generation it keeps", () => {
    const source = nodeFiles(platformSetup);
    const once = counted(source);
    platformRequest(once.files, "dev", { envvars: {} });
    const kept = counted(source);
    const project = Project.open(kept.files, { envvars: {} });
    project.generation();
    const before = kept.reads();
    project.request("dev");
    expect(kept.reads() - before).toBeLessThan(once.reads());
  });

  it("says the definitions have problems when asked to plan a project that does not resolve", () => {
    const project = Project.open(memoryFiles({ "project.yaml": "id: [\n" }), { envvars: {} });
    expect(() => project.plan(memoryFolder(), "duckdb")).toThrow(/The definitions have problems/);
  });
});
