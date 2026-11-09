// The fixes that move a setting to intent (SETTING_MOVED) or a Platform field into its
// section (PLATFORM_FIELD_MOVED) change where something is written, never what is built:
// on every starter and test fixture, and on each written the old way, applying any one of
// them leaves every generated file byte for byte as it was (definitions specification,
// sections 7 and 11.4).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { applyEdits, fixEdits, memoryFiles, type AnyDiagnostic, type Fix } from "@ingestron/config";
import { generateAll, packs } from "@ingestron/core";
import { isMap, parseDocument } from "yaml";
import { describe, expect, it } from "vitest";
import { filledStarter } from "./starters.js";

type Files = Record<string, string>;

const moving = new Set(["SETTING_MOVED", "PLATFORM_FIELD_MOVED"]);
const movedFields = ["mode", "workspace", "run_as", "compute", "permissions", "manage", "grants"];
const starters = join(import.meta.dirname, "../../core/project-templates");
const fixtures = join(import.meta.dirname, "fixtures");
// The Databricks pack's own fixtures, where its repository is linked; a published pack has none.
const packFixtures = join(
  import.meta.dirname,
  "../node_modules/@ingestron/pack-databricks/test/fixtures",
);

const folders = (root: string) =>
  existsSync(root)
    ? readdirSync(root).filter((name) => statSync(join(root, name)).isDirectory())
    : [];

/** Every file under the folder, by path, except what generating writes. */
function projectFiles(folder: string, under = folder): Files {
  return Object.fromEntries(
    readdirSync(under).flatMap((entry) => {
      const path = join(under, entry);
      if (statSync(path).isDirectory())
        return entry === "build" ? [] : Object.entries(projectFiles(folder, path));
      return [[relative(folder, path), readFileSync(path, "utf8")]];
    }),
  );
}

/** The project with its Platform's Databricks fields at the top, as written before the section. */
function fieldsAtTop(files: Files): Files | undefined {
  const text = files["platform.yaml"];
  const document = text === undefined ? undefined : parseDocument(text);
  const section = document?.get("databricks");
  if (!document || !isMap(section)) return undefined;
  for (const field of movedFields.filter((name) => section.has(name))) {
    document.set(field, section.get(field, true));
    section.delete(field);
  }
  if (section.items.length === 0) document.delete("databricks");
  return { ...files, "platform.yaml": document.toString() };
}

/** The retail starter as written before intent: the orders table's intent as settings, and notifications. */
function retailSettings(files: Files): Files {
  const flow = files["flows/shop.yaml"]!.replace(
    "    history: latest\n    sequence: updated_at\n    load: { deletes: { when: \"op = 'D'\" } }\n    store:\n      with: { except_columns: [op] }\n",
    "    store:\n      with: { mode: upsert, sequence_by: updated_at, delete_when: \"op = 'D'\", except_columns: [op] }\n",
  );
  const platform = files["platform.yaml"]!.replace(
    'alerts:\n  - { kind: email, to: ["${values.on_failure}"], on: [failure] }\n',
    'notifications:\n  on_failure: ["${values.on_failure}"]\n',
  );
  expect(flow).toContain("mode: upsert");
  expect(platform).toContain("notifications:");
  return { ...files, "flows/shop.yaml": flow, "platform.yaml": platform };
}

/**
 * The DuckDB starter with `mode: upsert` in the standard's settings, which its transform's
 * table never read: intent written for the whole standard would reach it.
 */
function duckdbUpsert(files: Files): Files {
  const standard = `${files["standard.yaml"]!}store:\n  settings:\n    duckdb-table: { mode: upsert }\n`;
  return { ...files, "standard.yaml": standard };
}

/** Each project: the starters with their values written, the CLI's fixtures and the pack's. */
function projects(): { name: string; files: Files }[] {
  const found = [
    ...folders(starters).map((name) => ({
      name: `starter ${name}`,
      files: projectFiles(filledStarter(name)),
    })),
    ...folders(fixtures).map((name) => ({
      name: `fixture ${name}`,
      files: projectFiles(join(fixtures, name)),
    })),
    ...folders(packFixtures).map((name) => ({
      name: `databricks fixture ${name}`,
      files: projectFiles(join(packFixtures, name)),
    })),
  ];
  const starter = (name: string) => found.find((project) => project.name === `starter ${name}`)!;
  const retail = starter("retail");
  const old = [
    ...found.flatMap(({ name, files }) => {
      const moved = fieldsAtTop(files);
      return moved ? [{ name: `${name}, its Databricks fields at the top`, files: moved }] : [];
    }),
    {
      name: "starter retail, written with settings",
      files: fieldsAtTop(retailSettings(retail.files))!,
    },
    {
      name: "starter duckdb, upsert in the standard",
      files: duckdbUpsert(starter("duckdb").files),
    },
  ];
  return [...found, ...old];
}

/** Every generated file, by output folder and path, and every diagnostic of every environment. */
function generated(files: Files) {
  const result = generateAll(memoryFiles(files), packs, {});
  const diagnostics: AnyDiagnostic[] = result.environmentReports.flatMap(
    (report) => report.diagnostics,
  );
  const built = Object.fromEntries(
    result.outputs.flatMap((output) =>
      Object.entries(output.files).map(([path, text]) => [`${output.folder}/${path}`, text]),
    ),
  );
  return { ok: result.ok, built, diagnostics };
}

/** The files with one fix applied, and whether each of its edits could be placed. */
function fixed(files: Files, fix: Fix): { changed: Files; placed: boolean } {
  const edits = fixEdits(fix, (path) => files[path]);
  const changed = { ...files };
  for (const file of new Set(edits.map((edit) => edit.file)))
    changed[file] = applyEdits(
      files[file]!,
      edits.filter((edit) => edit.file === file),
    );
  return { changed, placed: edits.length === fix.edits.length };
}

/** The moving fixes the project's diagnostics offer, each once. */
function movingFixes(diagnostics: AnyDiagnostic[]): Fix[] {
  const fixes = diagnostics
    .filter((diagnostic) => moving.has(diagnostic.code))
    .flatMap((diagnostic) => diagnostic.fixes ?? []);
  return [...new Map(fixes.map((fix) => [JSON.stringify(fix), fix])).values()];
}

describe("moving a setting or a Platform field", () => {
  const all = projects();
  const applied: string[] = [];

  for (const { name, files } of all) {
    it(`${name}: builds the same files after each fix`, () => {
      const before = generated(files);
      expect(before.ok, name).toBe(true);
      for (const fix of movingFixes(before.diagnostics)) {
        const { changed, placed } = fixed(files, fix);
        expect(placed, `${name}: ${fix.title} is placed`).toBe(true);
        const after = generated(changed);
        expect(after.ok, `${name}: ${fix.title}`).toBe(true);
        expect(after.built, `${name}: ${fix.title}`).toEqual(before.built);
        applied.push(`${name}: ${fix.title}`);
      }
    });
  }

  it("applies the fixes of the projects written the old way", () => {
    expect(applied).toEqual(
      expect.arrayContaining([
        "starter retail, written with settings: Write as intent",
        "starter retail, written with settings: Move to alerts",
        "fixture platform-setup, its Databricks fields at the top: Move to databricks.manage",
        "fixture platform-setup, its Databricks fields at the top: Move to databricks.grants",
      ]),
    );
  });
});
