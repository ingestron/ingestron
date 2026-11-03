// ${envvar:…} in the editor: .env files and VS Code's own environment count, and a
// variable found nowhere is information, not an error.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { problems } from "../src/diagnostics.js";
import { loadedDocuments, openProject, resolved } from "../src/project.js";

const minimal = join(import.meta.dirname, "../../cli/project-templates/minimal");
const landing = "abfss://landing@editorenv.dfs.core.windows.net/shop";

/** A copy of the minimal starter whose landing folder comes from ${envvar:NAME}. */
function workspace(name: string, files: Record<string, string> = {}): string {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-authoring-env-"));
  cpSync(minimal, folder, { recursive: true, filter: (path) => !path.includes("/build") });
  const project = join(folder, "project.yaml");
  writeFileSync(
    project,
    readFileSync(project, "utf8").replace("/Volumes/dev/landing/shop", `\${envvar:${name}}`),
  );
  for (const [file, text] of Object.entries(files)) writeFileSync(join(folder, file), text);
  return folder;
}

const folders: string[] = [];
const made = (name: string, files?: Record<string, string>) => {
  const folder = workspace(name, files);
  folders.push(folder);
  return folder;
};

afterEach(() => {
  delete process.env.INGESTRON_EDITOR_X;
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe("a variable the editor cannot find", () => {
  it("is information and the project still loads", () => {
    const project = openProject(made("NOPE"), new Map());
    const found = problems(project, "dev");
    expect(found.map((problem) => problem.code)).toEqual(["ENVVAR_MISSING"]);
    expect(found[0]).toMatchObject({ severity: "information" });
    expect(found[0]?.message).toContain(
      "NOPE isn't set; add it to .env.dev or set it before running Ingestron.",
    );
    expect(found[0]?.message).toContain(
      "Ingestron reads .env files in the project folder and the environment VS Code started with.",
    );
    expect(resolved(project, "dev").model).toBeDefined();
    expect(loadedDocuments(project, "dev")).toBeDefined();
  });

  it("names .env alone when no environment is selected", () => {
    const found = problems(openProject(made("NOPE"), new Map()), undefined);
    expect(found[0]?.message).toContain("add it to .env or set it");
    expect(found[0]?.message).not.toContain(".env.");
  });
});

describe("where the editor looks", () => {
  it("reads .env.<environment>", () => {
    const project = openProject(made("LANDING", { ".env.dev": `LANDING=${landing}\n` }), new Map());
    expect(problems(project, "dev")).toEqual([]);
  });

  it("reads .env, and not another environment's file", () => {
    const folder = made("LANDING", { ".env": `LANDING=${landing}\n` });
    expect(problems(openProject(folder, new Map()), "dev")).toEqual([]);
    const other = made("LANDING", { ".env.prod": `LANDING=${landing}\n` });
    expect(problems(openProject(other, new Map()), "dev").map((p) => p.code)).toEqual([
      "ENVVAR_MISSING",
    ]);
  });

  it("counts VS Code's environment", () => {
    process.env.INGESTRON_EDITOR_X = landing;
    const project = openProject(made("INGESTRON_EDITOR_X"), new Map());
    expect(problems(project, "dev")).toEqual([]);
    expect(loadedDocuments(project, "dev")).toBeDefined();
  });

  it("reads an unsaved .env", () => {
    const folder = made("LANDING");
    const unsaved = new Map([[join(folder, ".env.dev"), `LANDING=${landing}\n`]]);
    expect(problems(openProject(folder, unsaved), "dev")).toEqual([]);
  });

  it("sees a .env change in the next snapshot, as for a YAML change", () => {
    const folder = made("LANDING");
    const before = openProject(folder, new Map());
    expect(problems(before, "dev").map((p) => p.code)).toEqual(["ENVVAR_MISSING"]);
    writeFileSync(join(folder, ".env.dev"), `LANDING=${landing}\n`);
    expect(problems(openProject(folder, new Map()), "dev")).toEqual([]);
    writeFileSync(join(folder, ".env.dev"), "");
    expect(problems(openProject(folder, new Map()), "dev").map((p) => p.code)).toEqual([
      "ENVVAR_MISSING",
    ]);
  });

  it("never puts a value in a problem", () => {
    const folder = made("LANDING", {
      ".env.dev": "LANDING=secret-value-123\nbad line secret-value-456\n",
    });
    const text = JSON.stringify(problems(openProject(folder, new Map()), "dev"));
    expect(text).not.toContain("secret-value");
  });
});
