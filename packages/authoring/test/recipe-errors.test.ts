// Only the error a recipe gives for a rule it breaks is a recipe problem: any other error, such
// as a mistake in the code, is thrown on, for the project's recipes and the installed ones, so
// that it never shows as a broken recipe nor quietly turns the recipe completion off.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from "vitest";
import type { Problem } from "../src/index.js";
import { openProject, type Project } from "../src/project/project.js";
import { catalogRecipes, recipeProblems } from "../src/sources/index.js";
import type { RecipeProblem } from "../src/sources/recipe-problems.js";

const conformance = join(import.meta.dirname, "../../../spec/cli/conformance/sources/request");
let folder = "";
let recipe = "";
beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), "recipe-errors-"));
  cpSync(conformance, folder, { recursive: true });
  recipe = readFileSync(join(folder, "recipes/sample.yaml"), "utf8").replace("id: sample", "id: x");
  writeFileSync(join(folder, "recipes/x.yaml"), recipe);
});
afterAll(() => rmSync(folder, { recursive: true, force: true }));

/** The project, with `recipes/x.yaml` read as `read` gives it on each read, counted from 1. */
function withRead(read: (count: number) => string): Project {
  const project = openProject(folder, new Map());
  let count = 0;
  const files = {
    ...project.files,
    read: (path: string) =>
      path === "recipes/x.yaml" ? read((count += 1)) : project.files.read(path),
  };
  return { ...project, files };
}

const mistake = () => {
  throw new TypeError("Cannot read properties of undefined (reading 'kind')");
};

describe("an error that is not a recipe's", () => {
  it("is thrown on while the project's recipes are checked, not shown as a broken recipe", () => {
    expect(() => recipeProblems(withRead(mistake), "dev")).toThrow(TypeError);
  });

  it("is thrown on while the catalog is read, not taken as a broken installed recipe", () => {
    // The project's recipe is read sound when checked, then the catalog's read meets the mistake.
    const project = withRead((count) => (count === 1 ? recipe : mistake()));
    expect(() => catalogRecipes(project)).toThrow(TypeError);
  });

  it("is a broken recipe only when its message starts with the recipe's file", () => {
    const found = recipeProblems(
      withRead(() => "id: x\ntitle: [\n"),
      "dev",
    );
    expect(found.map(({ code, file }) => [code, file])).toEqual([
      ["SOURCE_RECIPE_BROKEN", "recipes/x.yaml"],
    ]);
  });
});

describe("a recipe problem", () => {
  it("is one of the editor's problems", () => {
    expectTypeOf<RecipeProblem>().toExtend<Problem>();
  });
});

describe("a recipe file whose name starts with a dot", () => {
  it("is neither read nor a broken recipe, as for the request", () => {
    const hidden = join(folder, "recipes/.draft.yaml");
    writeFileSync(hidden, "id: draft\ntitle: [\n");
    try {
      const project = openProject(folder, new Map());
      expect(
        recipeProblems(project, "dev").filter(({ code }) => code === "SOURCE_RECIPE_BROKEN"),
      ).toEqual([]);
      expect(catalogRecipes(project)?.has("draft")).toBe(false);
    } finally {
      rmSync(hidden);
    }
  });
});
