// A pack's checkFirstWrites: asked when an output is planned, with the paths the manifest lists.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { memoryFiles, type FileSource } from "@ingestron/config";
import type { Pack } from "@ingestron/definitions";
import { digestOf, manifestFile, memoryFolder } from "@ingestron/generate";
import { describe, expect, it } from "vitest";
import { packs, planOutput, Project, templatesFolder } from "../../src/index.js";

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

type Check = NonNullable<Pack["checkFirstWrites"]>;

/** The DuckDB pack with a hook added: the open project plans its output through it. */
function withHook(check: Check): Pack[] {
  return packs.map((pack) => (pack.id === "duckdb" ? { ...pack, checkFirstWrites: check } : pack));
}

/** A folder whose manifest lists `files`, each with the digest of its text. */
function generated(files: Readonly<Record<string, string>>): ReturnType<typeof memoryFolder> {
  const listed = Object.fromEntries(Object.entries(files).map(([p, t]) => [p, digestOf(t)]));
  return memoryFolder({
    ...files,
    [manifestFile]: JSON.stringify({ version: 1, files: listed }),
  });
}

describe("checkFirstWrites", () => {
  const output = Project.open(duckdbStarter(), { envvars: {} })
    .generation()
    .outputs.find(({ name }) => name === "duckdb")!;
  const first = Object.keys(output.files)[0]!;
  const hook: Check = (_files, before) => (before.has(first) ? [] : ["x is new"]);

  it("reports FIRST_WRITE when planning into an empty folder", () => {
    const project = Project.open(duckdbStarter(), { envvars: {}, packs: withHook(hook) });
    const plan = project.plan(memoryFolder(), "duckdb");
    expect(plan.problems).toEqual([{ code: "FIRST_WRITE", message: "x is new" }]);
    expect(plan.clean).toBe(false);
    expect(plan.upToDate).toBe(false);
  });

  it("plans when the manifest already lists the path", () => {
    const project = Project.open(duckdbStarter(), { envvars: {}, packs: withHook(hook) });
    const plan = project.plan(generated(output.files), "duckdb");
    expect(plan.problems).toEqual([]);
    expect(plan.upToDate).toBe(true);
  });

  it("gives the hook the output's files, the manifest's paths and the project's time", () => {
    const now = new Date("2026-11-15T10:00:00Z");
    let seen: unknown[] = [];
    const spy: Check = (files, before, at) => {
      seen = [files, [...before], at];
      return [];
    };
    const project = Project.open(duckdbStarter(), { envvars: {}, packs: withHook(spy), now });
    project.plan(generated({ [first]: output.files[first]! }), "duckdb");
    expect(seen).toEqual([output.files, [first], now]);
  });

  it("reports every message", () => {
    const plan = planOutput(
      memoryFolder(),
      "duckdb",
      { "a.json": "{}" },
      withHook(() => ["one", "two"]),
    );
    expect(plan.problems.map(({ code, message }) => `${code} ${message}`)).toEqual([
      "FIRST_WRITE one",
      "FIRST_WRITE two",
    ]);
  });

  it("does not ask the pack when the manifest cannot be read", () => {
    let asked = false;
    const spy: Check = () => ((asked = true), ["never"]);
    const folder = memoryFolder({ [manifestFile]: "not json" });
    const plan = planOutput(folder, "duckdb", { "a.json": "{}" }, withHook(spy));
    expect(asked).toBe(false);
    expect(plan.problems.map(({ code }) => code)).toEqual(["BAD_MANIFEST"]);
  });

  it("plans as before for a pack without the hook and for an output with no pack", () => {
    const files = { "a.json": "{}" };
    expect(planOutput(memoryFolder(), "duckdb", files, packs).problems).toEqual([]);
    expect(
      planOutput(
        memoryFolder(),
        "products",
        files,
        withHook(() => ["no"]),
      ).problems,
    ).toEqual([]);
  });
});
