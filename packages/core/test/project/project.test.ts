// Project: a project's files and packs held together, its generation worked
// out once and reused until refresh(), and the commands' results as values.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { memoryFiles, type FileSource } from "@ingestron/config";
import { memoryFolder, planGeneration } from "@ingestron/generate";
import { describe, expect, it } from "vitest";
import {
  compareEnvironments,
  generateAll,
  generatedOutputs,
  packs,
  platformRequest,
  Project,
  templatesFolder,
} from "../../src/index.js";

/** The DuckDB starter's files, in memory. */
function duckdbStarter(): FileSource {
  const root = join(templatesFolder, "duckdb");
  const walk = (folder: string): string[] =>
    readdirSync(folder).flatMap((name) => {
      const path = join(folder, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  return memoryFiles(
    Object.fromEntries(
      walk(root).map((path) => [relative(root, path), readFileSync(path, "utf8")]),
    ),
  );
}

describe("Project", () => {
  it("generates what generateAll generates for the same files, packs and values", () => {
    const files = duckdbStarter();
    const project = Project.open(files, { envvars: {} });
    expect(project.generation()).toEqual(generateAll(files, packs, {}));
  });

  it("keeps its generation until refresh()", () => {
    const project = Project.open(duckdbStarter(), { envvars: {} });
    const first = project.generation();
    expect(project.generation()).toBe(first);
    project.refresh();
    const again = project.generation();
    expect(again).not.toBe(first);
    expect(again).toEqual(first);
  });

  it("gives the outputs generatedOutputs gives for the same files, packs and values", () => {
    const files = duckdbStarter();
    const project = Project.open(files, { envvars: {} });
    expect(project.outputs()).toEqual(generatedOutputs(files, { packs, envvars: {} }));
  });

  it("keeps its outputs until refresh()", () => {
    const project = Project.open(duckdbStarter(), { envvars: {} });
    const first = project.outputs();
    expect(project.outputs()).toBe(first);
    project.refresh();
    const again = project.outputs();
    expect(again).not.toBe(first);
    expect(again).toEqual(first);
  });

  it("gives the refusal for a pack that cannot be loaded, as generatedOutputs does", () => {
    const files = duckdbStarter();
    const broken = [...packs, { ...packs[0]!, id: "broken", platformFields: ["schedule.nowhere"] }];
    const outputs = Project.open(files, { packs: broken, envvars: {} }).outputs();
    expect(outputs.ok).toBe(false);
    expect(outputs.refused?.code).toBe("PACK_LOAD");
    expect(outputs).toEqual(generatedOutputs(files, { packs: broken, envvars: {} }));
  });

  it("generates with REPLACE_ME as an error when asked, as check does", () => {
    const files = duckdbStarter();
    const project = Project.open(files, { envvars: {} });
    expect(project.generation({ replaceMe: "error" })).toEqual(
      generateAll(files, packs, {}, "error"),
    );
  });

  it("plans the DuckDB output: every file apply would write", () => {
    const project = Project.open(duckdbStarter(), { envvars: {} });
    const folder = memoryFolder();
    const output = project.generation().outputs.find(({ name }) => name === "duckdb")!;
    expect(project.plan(folder, "duckdb")).toEqual(planGeneration(memoryFolder(), output.files));
  });

  it("refuses to plan an output the project does not generate", () => {
    const project = Project.open(duckdbStarter(), { envvars: {} });
    expect(() => project.plan(memoryFolder(), "databricks")).toThrow(
      'The project generates no output named "databricks".',
    );
  });

  it("compares and requests as compareEnvironments and platformRequest do", () => {
    const files = duckdbStarter();
    const project = Project.open(files, { envvars: {} });
    expect(project.compare("dev", "dev")).toBe(
      compareEnvironments(files, "dev", "dev", { envvars: {} }),
    );
    expect(project.request("dev")).toBe(platformRequest(files, "dev", { envvars: {} }));
  });

  it("uses the packs it is given", () => {
    const project = Project.open(duckdbStarter(), { packs: [], envvars: {} });
    expect(project.generation().ok).toBe(false);
  });
});
