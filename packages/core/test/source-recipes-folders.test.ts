// The recipe folders: an installed folder's files, a project's own recipes (which files count and
// how big one may be), and the default recipe of a connector.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { defaultLimits, memoryFiles } from "@ingestron/config";
import { afterAll, describe, expect, it } from "vitest";
import { installedSourceRecipes, sourceOrigin, sourceRecipes } from "../src/sources/index.js";

const folder = resolve(import.meta.dirname, "../../../spec/cli/conformance/sources/recipes");
const fixture = (name: string): string => readFileSync(join(folder, `${name}.yaml`), "utf8");

const made: string[] = [];
afterAll(() => {
  for (const root of made) rmSync(root, { recursive: true, force: true });
});

/** A new folder holding the files, which are named relative to it. */
function folderWith(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "ingestron-recipes-test-"));
  made.push(root);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, name), text);
  return root;
}

/** The message `body` throws. */
function thrown(body: () => unknown): string {
  try {
    body();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("Nothing was thrown.");
}

describe("installedSourceRecipes, the folder's files", () => {
  it("skips a dot-file, and a folder or a file with another extension", () => {
    const root = folderWith({
      "sample.yaml": fixture("sample"),
      ".sample-copy.yaml": "not: a recipe",
      "notes.yml": "not: a recipe",
      "sample.yaml.bak": "not a recipe",
    });
    mkdirSync(join(root, "folder.yaml"));
    expect(installedSourceRecipes(root).map((recipe) => recipe.id)).toEqual(["sample"]);
  });

  it("lists the recipes in code-point order, whatever the folder lists first", () => {
    const root = folderWith({
      "sqlserver.yaml": fixture("sqlserver"),
      "sample.yaml": fixture("sample"),
      "lookups.yaml": fixture("lookups"),
    });
    expect(installedSourceRecipes(root).map((recipe) => recipe.id)).toEqual([
      "lookups",
      "sample",
      "sqlserver",
    ]);
  });

  it("is empty for a folder with no recipe", () => {
    expect(installedSourceRecipes(folderWith({ "README.md": "none" }))).toEqual([]);
  });
});

describe("sourceRecipes, the project's own files", () => {
  it("skips a project recipe whose name starts with a dot", () => {
    const files = memoryFiles({
      "recipes/.sample.yaml": "not: a recipe",
      "recipes/orders.yaml": fixture("sample").replace("id: sample", "id: orders"),
    });
    expect([...sourceRecipes(files, folder).keys()]).toContain("orders");
    expect(sourceRecipes(files, folder).size).toBe(7);
  });

  it("refuses a project recipe over the size limit, by its size when that is known", () => {
    let reads = 0;
    const files = {
      list: () => ["recipes/big.yaml"],
      read: () => (reads++, "id: big\n"),
      size: () => defaultLimits.maxFileBytes + 1,
    };
    expect(thrown(() => sourceRecipes(files, folder))).toBe(
      `recipes/big.yaml: it is ${defaultLimits.maxFileBytes + 1} bytes; the limit is ${defaultLimits.maxFileBytes}.`,
    );
    expect(reads).toBe(0);
  });

  it("refuses a project recipe over the size limit by its text when no size is known", () => {
    const text = `id: big\n# ${"x".repeat(defaultLimits.maxFileBytes)}\n`;
    const files = memoryFiles({ "recipes/big.yaml": text });
    expect(thrown(() => sourceRecipes(files, folder))).toMatch(
      /^recipes\/big\.yaml: it is \d+ bytes; the limit is \d+\.$/,
    );
  });
});

describe("sourceOrigin, a connector's default recipe", () => {
  it("gives a connector named like an object property no default recipe", () => {
    const recipes = sourceRecipes(undefined, folder);
    for (const connector of ["constructor", "toString", "__proto__", "hasOwnProperty"])
      expect(sourceOrigin({ id: "x", connector }, recipes)).toEqual({ inputs: {}, problems: [] });
  });
});
