// Source recipes: the conformance cases in spec/cli/conformance/sources/recipes/cases.json, the
// installed catalog, a project's own recipes and each connection's origin.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { memoryFiles } from "@ingestron/config";
import { afterAll, describe, expect, it } from "vitest";
import { bundledRecipesFolder } from "../src/folders.js";
import {
  installedSourceRecipes,
  readSourceRecipe,
  recipesFolderCandidates,
  sourceOrigin,
  sourceRecipes,
  sourceRecipeSchema,
  standardsRecipesFolder,
  type SourceRecipe,
} from "../src/sources/index.js";

interface Broken {
  name: string;
  from: string;
  text?: string;
  edits?: [string, string][];
  error?: string;
  errorStarts?: string;
}

interface Origin {
  name: string;
  connection: Parameters<typeof sourceOrigin>[0];
  recipes: "catalog" | "none";
  expected: { recipe: string | null; inputs: Record<string, string>; problems: string[] };
}

const folder = resolve(import.meta.dirname, "../../../spec/cli/conformance/sources/recipes");
const cases = JSON.parse(readFileSync(join(folder, "cases.json"), "utf8")) as {
  valid: { name: string; file: string; recipe: SourceRecipe }[];
  broken: Broken[];
  catalog: { order: string[] };
  origins: Origin[];
};

const made: string[] = [];
afterAll(() => {
  for (const root of made) rmSync(root, { recursive: true, force: true });
});

/** A fixture's text. */
function fixture(name: string): string {
  return readFileSync(join(folder, `${name}.yaml`), "utf8");
}

/** The text a broken case reads: its own `text`, or its fixture with the edits made. */
function textOf(item: Broken): string {
  if (item.text !== undefined) return item.text;
  let text = fixture(item.from);
  for (const [from, to] of item.edits ?? []) {
    if (!text.includes(from)) throw new Error(`${item.name}: "${from}" is not in ${item.from}.`);
    text = text.replace(from, to);
  }
  return text;
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

/** Checks the message against the case: exactly `error`, or starting with `errorStarts`. */
function expectMessage(message: string, item: Broken, prefix = ""): void {
  if (item.errorStarts !== undefined) {
    expect(message.startsWith(prefix + item.errorStarts), message).toBe(true);
    expect(message.length).toBeGreaterThan(prefix.length + item.errorStarts.length);
  } else expect(message).toBe(prefix + item.error);
}

/** A new folder holding the files, which are named relative to it. */
function folderWith(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "ingestron-recipes-test-"));
  made.push(root);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, name), text);
  return root;
}

describe("readSourceRecipe", () => {
  for (const item of cases.valid)
    it(`reads ${item.name}`, () => {
      expect(readSourceRecipe(fixture(item.name), item.file)).toEqual(item.recipe);
    });

  for (const item of cases.broken)
    it(`refuses: ${item.name}`, () => {
      expectMessage(
        thrown(() => readSourceRecipe(textOf(item), `recipes/${item.from}.yaml`)),
        item,
      );
    });

  it("names the file it is given", () => {
    const message = thrown(() => readSourceRecipe("- a\n", "/somewhere/else/sqlserver.yaml"));
    expect(message.startsWith("/somewhere/else/sqlserver.yaml: ")).toBe(true);
  });

  it("has a schema that names the same keys", () => {
    const keys = Object.keys(readSourceRecipe(fixture("files-mapped"), "files-mapped.yaml"));
    for (const key of keys.filter((name) => name !== "file"))
      expect(Object.keys(sourceRecipeSchema.properties)).toContain(key);
    expect(sourceRecipeSchema.required).toEqual(["id", "title", "kind", "ask", "read", "sources"]);
  });
});

describe("installedSourceRecipes", () => {
  it("lists every recipe in the folder by id, each as its own file", () => {
    const recipes = installedSourceRecipes(folder);
    expect(recipes.map((recipe) => recipe.id)).toEqual(cases.catalog.order);
    for (const recipe of recipes) expect(recipe.file).toBe(join(folder, `${recipe.id}.yaml`));
  });

  it("is empty for a root that is not there", () => {
    expect(installedSourceRecipes(join(folder, "no-such-root"))).toEqual([]);
  });

  it("looks first in the bundled folder, then in the standards package", () => {
    expect(recipesFolderCandidates()).toHaveLength(2);
    expect(recipesFolderCandidates()[0]).toBe(bundledRecipesFolder);
    expect(standardsRecipesFolder([undefined, join(folder, "no-such-root"), folder])).toBe(folder);
    expect(standardsRecipesFolder([folder, undefined])).toBe(folder);
    expect(standardsRecipesFolder([undefined, join(folder, "no-such-root")])).toBeUndefined();
  });

  it("reads only the .yaml files", () => {
    const root = folderWith({ "sample.yaml": fixture("sample"), "README.md": "not a recipe" });
    expect(installedSourceRecipes(root).map((recipe) => recipe.id)).toEqual(["sample"]);
  });

  it("refuses a broken recipe even when no connection uses it", () => {
    const item = cases.broken.find((entry) => entry.name === "unknown key") as Broken;
    const root = folderWith({ "sample.yaml": fixture("sample"), "sqlserver.yaml": textOf(item) });
    const message = thrown(() => installedSourceRecipes(root));
    expect(message.startsWith(join(root, "sqlserver.yaml"))).toBe(true);
    expectMessage(message.replace(join(root, "sqlserver.yaml"), "recipes/sqlserver.yaml"), item);
  });
});

describe("sourceRecipes", () => {
  it("is the catalog when the project has no recipes", () => {
    expect([
      ...sourceRecipes(memoryFiles({ "project.yaml": "id: demo\n" }), folder).keys(),
    ]).toEqual(cases.catalog.order);
    expect([...sourceRecipes(undefined, folder).keys()]).toEqual(cases.catalog.order);
  });

  it("has a project's recipe replace the catalog's of the same id", () => {
    const own = fixture("sqlserver").replace("title: SQL Server", "title: Our SQL Server");
    const recipes = sourceRecipes(memoryFiles({ "recipes/sqlserver.yaml": own }), folder);
    expect(recipes.get("sqlserver")?.title).toBe("Our SQL Server");
    expect(recipes.get("sqlserver")?.file).toBe("recipes/sqlserver.yaml");
    expect(recipes.get("salesforce")?.file).toBe(join(folder, "salesforce.yaml"));
    expect([...recipes.keys()]).toEqual(cases.catalog.order);
  });

  it("adds a project's recipe of a new id, in code-point order", () => {
    const own = fixture("sample").replace("id: sample", "id: orders");
    const recipes = sourceRecipes(memoryFiles({ "recipes/orders.yaml": own }), folder);
    expect([...recipes.keys()]).toEqual([
      "files-mapped",
      "lookups",
      "odata",
      "orders",
      "salesforce",
      "sample",
      "sqlserver",
    ]);
  });

  it("reads only recipes/<id>.yaml", () => {
    const files = memoryFiles({
      "recipes/sample.yml": "not: a recipe",
      "recipes/deeper/sample.yaml": "not: a recipe",
      "other/sample.yaml": "not: a recipe",
      "recipes/notes.txt": "not a recipe",
    });
    expect(sourceRecipes(files, folder).size).toBe(6);
  });

  it("refuses a broken project recipe even when no connection uses it", () => {
    const item = cases.broken.find((entry) => entry.name === "unknown key") as Broken;
    const files = memoryFiles({ "recipes/sqlserver.yaml": textOf(item) });
    expectMessage(
      thrown(() => sourceRecipes(files, folder)),
      item,
    );
  });

  it("refuses a project recipe whose id is not its file's name", () => {
    const files = memoryFiles({ "recipes/other.yaml": fixture("sample") });
    expect(thrown(() => sourceRecipes(files, folder))).toBe(
      'recipes/other.yaml: "id" is "sample", but the file is named other.yaml. Rename the file, or change id to other.',
    );
  });
});

describe("sourceOrigin", () => {
  for (const item of cases.origins)
    it(item.name, () => {
      const recipes =
        item.recipes === "none"
          ? new Map<string, SourceRecipe>()
          : sourceRecipes(undefined, folder);
      const origin = sourceOrigin(item.connection, recipes);
      expect(origin.recipe?.id ?? null).toBe(item.expected.recipe);
      if (item.expected.recipe) expect(origin.recipe).toBe(recipes.get(item.expected.recipe));
      expect(origin.inputs).toEqual(item.expected.inputs);
      expect(origin.problems).toEqual(item.expected.problems);
    });

  it("uses the project's recipe over the catalog's for a default origin", () => {
    const own = fixture("sqlserver").replace("title: SQL Server", "title: Our SQL Server");
    const recipes = sourceRecipes(memoryFiles({ "recipes/sqlserver.yaml": own }), folder);
    expect(sourceOrigin({ id: "erp", connector: "sqlserver" }, recipes).recipe?.title).toBe(
      "Our SQL Server",
    );
  });
});
