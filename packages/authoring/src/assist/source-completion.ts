// Completion from a project's source metadata and its recipe catalog: a flow table's `object`,
// the column names in a flow table's checks and in a contract's properties, a connection's
// `metadata.from` and the keys of its `metadata.with`. Only names, types, counts, dates and the
// recipes' own words are shown: never a value from a source's rows, which no document holds.
import type { SourceColumnDoc, SourceTable } from "@ingestron/definitions";
import { flowFacts, writtenKeys, type Place } from "../navigation/index.js";
import type { Project } from "../project/index.js";
import { catalogRecipes } from "../sources/index.js";
import { metadataTables, sourceTablesAt } from "./source-tables.js";
import type { Suggestion } from "./suggestion.js";

/**
 * The value being typed at `place`, from the metadata or the catalog; undefined for any other
 * place. Each replaces the whole value typed so far, whatever dots or slashes it holds.
 */
export function sourceValues(
  project: Project,
  place: Place,
  environment: string | undefined,
): Suggestion[] | undefined {
  const replaceFrom = valueStart(place);
  return valuesAt(project, place, environment)?.map((item) => ({ ...item, replaceFrom }));
}

/**
 * The offset where the value typed so far on the cursor's line starts, after any opening quote:
 * all of it after the key, spaces included. `placeAt` takes a line whose value has a space, such
 * as `object: Order D`, for a key, so no value is offered there yet.
 */
function valueStart({ before }: Place): number {
  const line = before.slice(before.lastIndexOf("\n") + 1);
  const typed = /^\s*(?:-\s+)?[\w.-]+:\s*(.*)$/.exec(line)?.[1] ?? "";
  return before.length - typed.replace(/^["']/, "").length;
}

function valuesAt(
  project: Project,
  place: Place,
  environment: string | undefined,
): Suggestion[] | undefined {
  const { kind, path } = place;
  const where = path.join("/");
  if (kind === "Connection") return where === "metadata/from" ? recipeIds(project) : undefined;
  if (kind === "Flow")
    return /^tables\/[^/]+\/object$/.test(where) ? objects(project, place, environment) : undefined;
  if (kind === "DataContract") return contractColumns(project, place, environment);
  return undefined;
}

/**
 * What is typed on a line that is not a value of its own: the SQL of a flow table's check, or a
 * key of a connection's `metadata.with`. Undefined for any other place.
 */
export function sourceTyped(
  project: Project,
  place: Place,
  environment: string | undefined,
): Suggestion[] | undefined {
  return checkColumns(project, place, environment) ?? inputNames(project, place);
}

/** The recipe's inputs not yet written, for a new key in a connection's `metadata.with`. */
function inputNames(project: Project, place: Place): Suggestion[] | undefined {
  if (place.kind !== "Connection" || place.path.join("/") !== "metadata/with") return undefined;
  const from = (place.data.metadata as { from?: unknown } | undefined)?.from;
  const recipe = typeof from === "string" ? catalogRecipes(project)?.get(from) : undefined;
  if (!recipe) return undefined;
  const written = writtenKeys(place);
  return Object.entries(recipe.inputs)
    .filter(([label]) => !written.has(label))
    .map(([label, { description }]) => ({ label, kind: "field", documentation: description }));
}

/** The check's text before the cursor, with the table's key, when a check's SQL is being typed. */
function checkAt(place: Place): { table: string; typed: string; tight: boolean } | undefined {
  if (place.kind !== "Flow" || place.inFlow) return undefined;
  const line = place.before.slice(place.before.lastIndexOf("\n") + 1);
  const check = /^\s*(?:-\s+)?check:(\s*)(.*)$/.exec(line);
  const table = /^tables\/([^/]+)\/expectations(?:\/\d+)?(?:\/check)?$/.exec(place.path.join("/"));
  if (!check || !table) return undefined;
  const typed = (check[2] ?? "").replace(/^"/, "");
  return { table: table[1]!, typed, tight: check[1] === "" && typed === "" };
}

/**
 * The columns of the table at the cursor while a check's SQL is being typed: `[]` where a column
 * cannot go (inside a quoted text) or the table has no metadata entry, undefined elsewhere.
 */
function checkColumns(
  project: Project,
  place: Place,
  environment: string | undefined,
): Suggestion[] | undefined {
  const check = checkAt(place);
  if (!check) return undefined;
  if ((check.typed.match(/'/g) ?? []).length % 2 === 1) return [];
  const entry = tableOf(project, place, check.table, environment)?.entry;
  const columns = (entry?.columns ?? []).map(column);
  // Straight after `check:` a column brings its space.
  return check.tight ? columns.map((item) => ({ ...item, insertText: ` ${item.label}` })) : columns;
}

/** The objects of the flow's connection's metadata document, with their columns and capture date. */
function objects(
  project: Project,
  place: Place,
  environment: string | undefined,
): Suggestion[] | undefined {
  const source = flowFacts(project, place).source;
  const tables = source ? metadataTables(project, place, source, environment) : [];
  if (tables.length === 0) return undefined;
  return tables.map((table) => {
    const count = table.columns.length;
    const date = /^\d{4}-\d{2}-\d{2}/.exec(table.captured?.at ?? "")?.[0];
    const columns = `${count} column${count === 1 ? "" : "s"}`;
    return {
      label: table.object,
      kind: "reference",
      detail: date ? `${columns}, captured ${date}` : columns,
    };
  });
}

/** Each recipe of the catalog, with its title; undefined while a recipe is broken. */
function recipeIds(project: Project): Suggestion[] | undefined {
  const recipes = catalogRecipes(project);
  if (!recipes) return undefined;
  return [...recipes.values()].map(({ id, title }) => ({
    label: id,
    kind: "reference",
    detail: title,
  }));
}

/** The flow table at `key` in the flow being edited, as the resolved project lists it. */
function tableOf(
  project: Project,
  place: Place,
  key: string,
  environment: string | undefined,
): SourceTable | undefined {
  const flow = place.data.id;
  return sourceTablesAt(project, place, environment).find(
    (item) => item.flow === flow && item.table === key,
  );
}

/** A column as a suggestion, with the type the source gives it (else the logical type). */
function column({ name, sourceType, logicalType }: SourceColumnDoc): Suggestion {
  return { label: name, kind: "reference", detail: sourceType ?? logicalType };
}

/**
 * The name of a property in a contract, from the metadata entries of the flow tables that use
 * the contract; a nested property takes the columns of the column its parents name.
 */
function contractColumns(
  project: Project,
  place: Place,
  environment: string | undefined,
): Suggestion[] | undefined {
  const where = /^schema\/(\d+)((?:\/properties\/\d+)*)\/properties(?:\/\d+)?\/name$/.exec(
    place.path.join("/"),
  );
  if (!where) return undefined;
  const parents = namesAbove(
    place,
    Number(where[1]),
    (where[2] ?? "").split("/properties/").slice(1),
  );
  const id = place.data.id;
  const tables = sourceTablesAt(project, place, environment).filter(
    (item) => item.contract === id && item.entry,
  );
  const seen = new Set<string>();
  const found = tables
    .flatMap((item) => columnsBelow(item.entry!.columns, parents))
    .filter(({ name }) => !seen.has(name) && Boolean(seen.add(name)));
  return found.length === 0 ? undefined : found.map(column);
}

/** The names, from the schema item down, of the properties that hold the one being typed. */
function namesAbove(place: Place, schema: number, indexes: string[]): string[] {
  const names: string[] = [];
  let node: unknown = (place.data.schema as unknown[] | undefined)?.[schema];
  for (const index of indexes) {
    node = (node as { properties?: unknown[] } | undefined)?.properties?.[Number(index)];
    names.push(String((node as { name?: unknown } | undefined)?.name));
  }
  return names;
}

/** The columns inside the column that `parents` name, one inside the other. */
function columnsBelow(columns: SourceColumnDoc[], parents: string[]): SourceColumnDoc[] {
  let level = columns;
  for (const name of parents) level = level.find((item) => item.name === name)?.properties ?? [];
  return level;
}
