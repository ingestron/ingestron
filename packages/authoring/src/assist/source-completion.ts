// Completion from a project's source metadata and its recipe catalog: a flow table's `object`,
// its column names (source-columns.ts), a connection's `metadata.from` and the keys of its
// `metadata.with`. Only names, types, counts, dates and the recipes' own words are shown:
// never a value from a source's rows, which no document holds.
import { flowFacts, writtenKeys, type Place } from "../navigation/index.js";
import type { Project } from "../project/index.js";
import { catalogRecipes } from "../sources/index.js";
import {
  checkColumns,
  cleanseColumnKeys,
  contractColumns,
  tableColumns,
} from "./source-columns.js";
import { metadataTables } from "./source-tables.js";
import type { Suggestion } from "./suggestion.js";
import { valueStart } from "./typed-text.js";

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

function valuesAt(
  project: Project,
  place: Place,
  environment: string | undefined,
): Suggestion[] | undefined {
  const { kind, path } = place;
  const where = path.join("/");
  if (kind === "Connection") return where === "metadata/from" ? recipeIds(project) : undefined;
  if (kind === "Flow") {
    if (/^tables\/[^/]+\/object$/.test(where)) return objects(project, place, environment);
    const table =
      /^tables\/([^/]+)\/(?:sequence|load\/cursor|cleanse\/deduplicate\/order_by)$/.exec(
        where,
      )?.[1];
    return table === undefined ? undefined : tableColumns(project, place, table, environment);
  }
  if (kind === "DataContract") return contractColumns(project, place, environment);
  return undefined;
}

/**
 * What is typed on a line that is not a value of its own: the SQL of a flow table's check, a key
 * of a connection's `metadata.with` or a new key under a flow table's `cleanse.columns`.
 * Undefined for any other place.
 */
export function sourceTyped(
  project: Project,
  place: Place,
  environment: string | undefined,
): Suggestion[] | undefined {
  return (
    checkColumns(project, place, environment) ??
    inputNames(project, place) ??
    cleanseColumnKeys(project, place, environment)
  );
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
