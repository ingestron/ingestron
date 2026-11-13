// The two problems a connection's metadata can have that only the recipes settle: a recipe that
// does not exist and an input it does not take (spec/cli/sources.md, section 1, "A connection's
// recipe"). `sourceOrigin` words them; this places them in the connection's document.
import { readSourceRecipe, sourceOrigin, sourceRecipes, type SourceRecipe } from "@ingestron/core";
import type { DefinitionDocument } from "@ingestron/config";
import { kinds } from "@ingestron/definitions";
import {
  loadedDocuments,
  positionAt,
  rangeOf,
  type Position,
  type Project,
} from "../project/index.js";

/** A recipe problem, in the shape of the editor's problems. */
export interface RecipeProblem {
  file: string;
  range: { start: Position; end: Position };
  severity: "error";
  code: "SOURCE_RECIPE_UNKNOWN" | "SOURCE_RECIPE_INPUT" | "SOURCE_RECIPE_BROKEN";
  message: string;
}

/** What a connection document holds that decides its recipe. */
interface ConnectionValue {
  id: string;
  connector: string;
  metadata?: { from: string; with?: Record<string, string> };
}

/** True when the connection's `metadata` has the shape the schema gives it. */
function hasMetadata(value: ConnectionValue): value is ConnectionValue & {
  metadata: { from: string; with?: Record<string, string> };
} {
  const { metadata } = value;
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    typeof metadata.from === "string" &&
    (metadata.with === undefined || (typeof metadata.with === "object" && metadata.with !== null))
  );
}

const escaped = (key: string): string => key.replaceAll("~", "~0").replaceAll("/", "~1");

/** The place of the value (or the key) at a pointer in the document's file. */
function placeOf(
  project: Project,
  { file, locate }: DefinitionDocument,
  pointer: string,
  part: "key" | "value",
): RecipeProblem["range"] {
  const text = project.files.read(file) ?? "";
  const range = rangeOf(text, pointer, part);
  if (range) return { start: positionAt(text, range[0]), end: positionAt(text, range[1]) };
  const { line, column } = locate(pointer);
  const start = { line: line - 1, character: column - 1 };
  return { start, end: start };
}

/** The recipe problems of one connection document. */
function connectionProblems(
  project: Project,
  document: DefinitionDocument,
  recipes: Map<string, SourceRecipe>,
): RecipeProblem[] {
  const connection = document.value as ConnectionValue;
  if (!hasMetadata(connection)) return [];
  const { recipe, inputs, problems } = sourceOrigin(connection, recipes);
  const { file } = document;
  if (recipe === undefined)
    return problems.map((message) => ({
      file,
      range: placeOf(project, document, "/metadata/from", "value"),
      severity: "error",
      code: "SOURCE_RECIPE_UNKNOWN",
      message,
    }));
  // Each problem is for one `with` key the recipe takes no input for, in the order given.
  const refused = Object.keys(connection.metadata.with ?? {}).filter(
    (name) => !Object.hasOwn(inputs, name),
  );
  return problems.map((message, index) => ({
    file,
    range: placeOf(project, document, `/metadata/with/${escaped(refused[index] ?? "")}`, "key"),
    severity: "error",
    code: "SOURCE_RECIPE_INPUT",
    message,
  }));
}

/** What the project's recipes come to: the problems of broken ones, else the catalog of recipes. */
interface Catalog {
  broken: RecipeProblem[];
  recipes?: Map<string, SourceRecipe>;
}

const catalogs = new WeakMap<Project, Catalog>();

/**
 * True for the error `readSourceRecipe` gives for a recipe that breaks a rule, which starts with
 * the recipe's file and `: `: `file` for one of the project's, or any `.yaml` file for an
 * installed one, wherever the recipes are installed. A system error (it has a `code`) and any
 * other error, such as a mistake in the code, is not one, and is thrown on.
 */
function isRuleError(error: unknown, file?: string): error is Error {
  if (!(error instanceof Error) || "code" in error) return false;
  return file === undefined
    ? /^[^\n]*\.yaml: /.test(error.message)
    : error.message.startsWith(`${file}: `);
}

/** `readSourceRecipe`'s error for the project's recipe at `file`, as a problem; else undefined. */
function brokenAt(project: Project, file: string): RecipeProblem | undefined {
  try {
    readSourceRecipe(project.files.read(file) ?? "", file);
    return undefined;
  } catch (error) {
    if (!isRuleError(error, file)) throw error;
    const start = { line: 0, character: 0 };
    return {
      file,
      range: { start, end: start },
      severity: "error",
      code: "SOURCE_RECIPE_BROKEN",
      message: error.message,
    };
  }
}

/**
 * The project's recipes, read once per snapshot. The project's own are read first, so that a
 * broken one is a problem at its file; the recipes are not read whole then, and no other recipe
 * problem is computed. An installed recipe that breaks a rule gives none (the catalog is checked
 * before release): the recipes are left out, and so are the other problems.
 */
function catalogOf(project: Project): Catalog {
  let catalog = catalogs.get(project);
  if (catalog) return catalog;
  const broken = project.files
    .list()
    .filter((file) => /^recipes\/[^/.][^/]*\.yaml$/.test(file))
    .flatMap((file) => brokenAt(project, file) ?? []);
  catalog = { broken };
  if (broken.length === 0)
    try {
      catalog.recipes = sourceRecipes(project.files);
    } catch (error) {
      // The project's recipes are sound, so the recipe that broke is an installed one.
      if (!isRuleError(error)) throw error;
    }
  catalogs.set(project, catalog);
  return catalog;
}

/** The project's recipes by id, read once per snapshot; undefined while any recipe is broken. */
export function catalogRecipes(project: Project): Map<string, SourceRecipe> | undefined {
  return catalogOf(project).recipes;
}

/** The recipe problems of every connection in the project, for the environment. */
export function recipeProblems(project: Project, environment: string | undefined): RecipeProblem[] {
  const { broken, recipes } = catalogOf(project);
  if (broken.length > 0) return broken;
  const documents = loadedDocuments(project, environment);
  if (recipes === undefined || documents === undefined) return [];
  return documents
    .filter(({ kind }) => kind === kinds.connection.kind)
    .flatMap((document) => connectionProblems(project, document, recipes));
}
