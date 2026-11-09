// ${envvar:…} in the editor: .env files and VS Code's own environment count, and a
// variable found nowhere is information, not an error.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { problems } from "../src/diagnostics/diagnostics.js";
import { loadedDocuments, openProject, resolved } from "../src/project/project.js";
import { cleanEnvironment, fromFile, fromHost, landing, made, unset } from "./env-workspace.js";

cleanEnvironment();

describe("a variable the editor cannot find", () => {
  it("is information that the deploying pipeline supplies it, and the project still loads", () => {
    const project = openProject(made(unset), new Map());
    const found = problems(project, "dev");
    expect(found.map((problem) => problem.code)).toEqual(["ENVVAR_MISSING"]);
    expect(found[0]).toMatchObject({ severity: "information" });
    expect(found[0]?.message).toBe(
      `${unset} is supplied when deploying, as \`BUNDLE_VAR_${unset.toLowerCase()}\` (databricks). Plan does not read it, so it needs no .env.dev entry.`,
    );
    expect(resolved(project, "dev").model).toBeDefined();
    expect(loadedDocuments(project, "dev")).toBeDefined();
  });

  it("names .env alone when no environment is selected", () => {
    const found = problems(openProject(made(unset), new Map()), undefined);
    expect(found[0]?.message).toContain("add it to .env or set it");
    expect(found[0]?.message).not.toContain(".env.");
  });
});

describe("where the editor looks", () => {
  it("reads .env.<environment>", () => {
    const folder = made(fromFile, { ".env.dev": `${fromFile}=${landing}\n` });
    expect(problems(openProject(folder, new Map()), "dev")).toEqual([]);
  });

  it("reads .env, and not another environment's file", () => {
    const folder = made(fromFile, { ".env": `${fromFile}=${landing}\n` });
    expect(problems(openProject(folder, new Map()), "dev")).toEqual([]);
    const other = made(fromFile, { ".env.prod": `${fromFile}=${landing}\n` });
    expect(problems(openProject(other, new Map()), "dev").map((p) => p.code)).toEqual([
      "ENVVAR_MISSING",
    ]);
  });

  it("counts VS Code's environment", () => {
    process.env[fromHost] = landing;
    const project = openProject(made(fromHost), new Map());
    expect(problems(project, "dev")).toEqual([]);
    expect(loadedDocuments(project, "dev")).toBeDefined();
  });

  it("reads an unsaved .env", () => {
    const folder = made(fromFile);
    const unsaved = new Map([[join(folder, ".env.dev"), `${fromFile}=${landing}\n`]]);
    expect(problems(openProject(folder, unsaved), "dev")).toEqual([]);
  });

  it("sees a .env change in the next snapshot, as for a YAML change", () => {
    const folder = made(fromFile);
    expect(problems(openProject(folder, new Map()), "dev").map((p) => p.code)).toEqual([
      "ENVVAR_MISSING",
    ]);
    writeFileSync(join(folder, ".env.dev"), `${fromFile}=${landing}\n`);
    expect(problems(openProject(folder, new Map()), "dev")).toEqual([]);
    writeFileSync(join(folder, ".env.dev"), "");
    expect(problems(openProject(folder, new Map()), "dev").map((p) => p.code)).toEqual([
      "ENVVAR_MISSING",
    ]);
  });

  it("never quotes a bad .env line in a problem", () => {
    const folder = made(fromFile, {
      ".env.dev": `${fromFile}=${landing}\nbad line value-456\n`,
    });
    const found = problems(openProject(folder, new Map()), "dev");
    expect(found.map((problem) => problem.code)).toEqual(["ENV_FILE_LINE"]);
    expect(JSON.stringify(found)).not.toContain("value-456");
  });
});
