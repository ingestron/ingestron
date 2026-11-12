// The source recipes a project can use: the ones installed with Ingestron, the project's own,
// and the one each connection uses. The rules are in spec/cli/sources.md, section 1.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { FileSource } from "@ingestron/config";
import { bundledRecipesFolder } from "../folders.js";
import { readSourceRecipe } from "./read.js";
import type { SourceRecipe } from "./recipe.js";

/** The `recipes` folder of the `@ingestron/standards` package, or undefined when it does not resolve. */
function packageRecipesFolder(): string | undefined {
  try {
    const manifest = createRequire(import.meta.url).resolve("@ingestron/standards/package.json");
    return join(dirname(manifest), "recipes");
  } catch {
    return undefined;
  }
}

/**
 * Where the installed recipes are looked for, in order: the `source-recipes` folder a bundled
 * release copies beside its code, then the `@ingestron/standards` package's `recipes` folder.
 * The first that exists is used.
 * @internal
 */
export function recipesFolderCandidates(): (string | undefined)[] {
  return [bundledRecipesFolder, packageRecipesFolder()];
}

/**
 * The installed recipes' folder: the first of `candidates` that exists, by default
 * `recipesFolderCandidates()`. Undefined when none exists.
 * @internal
 */
export function standardsRecipesFolder(
  candidates: (string | undefined)[] = recipesFolderCandidates(),
): string | undefined {
  return candidates.find((folder) => folder !== undefined && existsSync(folder));
}

/** The recipe files directly in `folder`, by name in code point order. */
function recipeFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^[^.].*\.yaml$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Every recipe in `root`, which holds `<id>.yaml` files, by id. `root` defaults to the
 * `source-recipes` folder a bundled release copies beside its code, else the `recipes` folder of
 * `@ingestron/standards`. There are none when no such folder is there. A recipe that breaks a
 * rule throws the error `readSourceRecipe` gives, whichever connection uses it.
 * @public
 */
export function installedSourceRecipes(root?: string): SourceRecipe[] {
  root ??= standardsRecipesFolder();
  if (root === undefined || !existsSync(root)) return [];
  const folder = root;
  return recipeFiles(folder).map((name) =>
    readSourceRecipe(readFileSync(join(folder, name), "utf8"), join(folder, name)),
  );
}

/**
 * The recipes a project can use, by id in code point order: the installed ones, with each of
 * the project's own `recipes/<id>.yaml` replacing the installed recipe of the same id. A recipe
 * that breaks a rule throws, installed or the project's own, whichever connection uses it.
 * @public
 */
export function sourceRecipes(files?: FileSource, root?: string): Map<string, SourceRecipe> {
  const recipes = new Map<string, SourceRecipe>();
  for (const recipe of installedSourceRecipes(root)) recipes.set(recipe.id, recipe);
  for (const path of files?.list().filter((name) => /^recipes\/[^/]+\.yaml$/.test(name)) ?? []) {
    const recipe = readSourceRecipe(files?.read(path) ?? "", path);
    recipes.set(recipe.id, recipe);
  }
  return new Map([...recipes].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** The recipe each connector uses when its connection gives no `metadata`. */
const defaultRecipes: Record<string, string> = {
  files: "sample",
  sqlserver: "sqlserver",
  salesforce: "salesforce",
  kafka: "schema-registry",
};

const ids = (names: string[]): string => (names.length > 0 ? names.join(", ") : "none");

/**
 * A connection's recipe and the inputs it gives it. The recipe is the one `metadata.from` names,
 * else its connector's default (`files` has `sample`, `sqlserver` has `sqlserver`, `salesforce`
 * has `salesforce` and `kafka` has `schema-registry`), else none. A default that is not among
 * `recipes` is no recipe and no problem. `problems` holds the messages for a `from` that names
 * no recipe and for each `with` key the recipe takes no input for; `inputs` holds the accepted
 * ones.
 * @public
 */
export function sourceOrigin(
  connection: {
    id: string;
    connector: string;
    metadata?: { from: string; with?: Record<string, string> };
  },
  recipes: Map<string, SourceRecipe>,
): { recipe?: SourceRecipe; inputs: Record<string, string>; problems: string[] } {
  const { metadata } = connection;
  const recipe = recipes.get(metadata?.from ?? defaultRecipes[connection.connector] ?? "");
  if (metadata === undefined)
    return recipe ? { recipe, inputs: {}, problems: [] } : { inputs: {}, problems: [] };
  if (recipe === undefined)
    return {
      inputs: {},
      problems: [
        `The connection "${connection.id}" names the recipe "${metadata.from}", which does not exist. Recipes: ${ids([...recipes.keys()].sort())}.`,
      ],
    };
  const taken = Object.keys(recipe.inputs);
  const inputs: Record<string, string> = {};
  const problems: string[] = [];
  for (const [name, value] of Object.entries(metadata.with ?? {}))
    if (taken.includes(name)) inputs[name] = value;
    else
      problems.push(
        `The recipe "${recipe.id}" takes no input "${name}". Its inputs: ${ids(taken)}.`,
      );
  return { recipe, inputs, problems };
}
