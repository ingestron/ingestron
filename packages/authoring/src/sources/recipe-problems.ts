// The two problems a connection's metadata can have that only the recipes settle: a recipe that
// does not exist and an input it does not take (spec/cli/sources.md, section 1, "A connection's
// recipe"). `sourceOrigin` words them; this places them in the connection's document.
import { sourceOrigin, sourceRecipes } from "@ingestron/core";
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
  code: "SOURCE_RECIPE_UNKNOWN" | "SOURCE_RECIPE_INPUT";
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
  recipes: ReturnType<typeof sourceRecipes>,
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
  const refused = Object.keys(connection.metadata.with ?? {}).filter((name) => !(name in inputs));
  return problems.map((message, index) => ({
    file,
    range: placeOf(project, document, `/metadata/with/${escaped(refused[index] ?? "")}`, "key"),
    severity: "error",
    code: "SOURCE_RECIPE_INPUT",
    message,
  }));
}

/** The recipe problems of every connection in the project, for the environment. */
export function recipeProblems(project: Project, environment: string | undefined): RecipeProblem[] {
  const documents = loadedDocuments(project, environment);
  if (documents === undefined) return [];
  const recipes = recipesOf(project);
  return recipes === undefined
    ? []
    : documents
        .filter(({ kind }) => kind === kinds.connection.kind)
        .flatMap((document) => connectionProblems(project, document, recipes));
}

/** The project's recipes; undefined when one breaks a rule, which the request reports itself. */
function recipesOf(project: Project): ReturnType<typeof sourceRecipes> | undefined {
  try {
    return sourceRecipes(project.files);
  } catch {
    return undefined;
  }
}
