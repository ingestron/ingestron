// A connection-first project's values: REPLACE_ME where Ingestron cannot know a value, the
// written defaults with a comment, and secret names (spec/cli/projects.md). Every fact
// comes from the connector's metadata and the method's settings schema.
import type { Connector } from "@ingestron/definitions";
import { isMap, isScalar } from "yaml";
import { composeConnection, isSecret, secretReference } from "./init-connection.js";
import {
  commentAfter,
  deleteIfThere,
  editYaml,
  replaceMe,
  setWithComment,
  shapedPlaceholder,
  type YamlDocument,
} from "./init-yaml.js";
import {
  composePlatform,
  composeSchedule,
  composeStandard,
  methodSettings,
  type Route,
} from "./init-platform.js";
import type { Content } from "./scaffold.js";

/** What the recipe is made of: its files and what reads them. */
export interface RecipeFacts {
  connection: string;
  flows: string[];
  route: Route;
  connector?: Connector;
}

/** What `init` knows when it composes: the project's id and environments, and the day. */
export interface Composing {
  project: string;
  environments: string[];
  today: string;
  /**
   * The text source options to write as REPLACE_ME: those the connector needs, found by
   * resolving without them (spec/cli/projects.md). Every other text option is left out.
   */
  keep?: ReadonlySet<string>;
}

/**
 * Writes the recipe's values as a new project has them; the files are edited in place.
 * Returns the text source options left out, which `init` keeps when it cannot resolve.
 */
export function composeRecipe(
  files: Record<string, Content>,
  facts: RecipeFacts,
  composing: Composing,
): string[] {
  let connectionId = "";
  const leftOut: string[] = [];
  editYaml(files, facts.connection, (document) => {
    connectionId = String(document.get("id"));
    composeConnection(document, facts.connector, `${composing.project}-${connectionId}`);
  });
  const secret = `${composing.project}-${connectionId}`;
  for (const flow of facts.flows)
    editYaml(files, flow, (document) =>
      leftOut.push(...composeFlow(document, facts, secret, composing.keep ?? new Set())),
    );
  composePlatform(files, facts.route, composing);
  composeSchedule(files, facts.route);
  composeStandard(files, facts.route, composing);
  return leftOut;
}

/** A flow: its method, each table's object, a required query, and its source options. */
function composeFlow(
  document: YamlDocument,
  facts: RecipeFacts,
  secretPrefix: string,
  keep: ReadonlySet<string>,
): string[] {
  commentAfter(
    document,
    ["ingest", "uses"],
    "the route's ingest method; a table may choose another",
  );
  composeObjects(document, facts.connector?.object ?? "");
  composeQuery(document, facts);
  const leftOut = composeOptions(document, facts, secretPrefix, keep);
  const options = document.getIn(["ingest", "with", "source_options"]);
  if (isMap(options) && options.items.length === 0)
    deleteIfThere(document, ["ingest", "with", "source_options"]);
  const settings = document.getIn(["ingest", "with"]);
  if (isMap(settings) && settings.items.length === 0) document.deleteIn(["ingest", "with"]);
  return leftOut;
}

/** Each table's object, REPLACE_ME in the connector's shape. */
function composeObjects(document: YamlDocument, shape: string): void {
  const tables = document.get("tables");
  if (!isMap(tables)) return;
  for (const pair of tables.items) {
    const table = String(isScalar(pair.key) ? pair.key.value : pair.key);
    const written = document.getIn(["tables", table, "object"]);
    // An object the example already writes as REPLACE_ME keeps its own shape and comment.
    if (written === undefined || String(written).includes(replaceMe)) continue;
    // The connector's own example names one object: the other tables have their own.
    const kind = shape.split(", such as")[0];
    const comment = `The source object${kind ? `: ${kind}` : ""}`;
    setWithComment(document, ["tables", table, "object"], shapedPlaceholder(shape), comment);
  }
}

/** A query the connector requires is REPLACE_ME; any other is left out. */
function composeQuery(document: YamlDocument, facts: RecipeFacts): void {
  if (document.getIn(["ingest", "with", "query"]) === undefined) return;
  if (facts.connector?.reading?.query !== "required") {
    document.deleteIn(["ingest", "with", "query"]);
    return;
  }
  const description = schemaOf(methodSettings(facts.route.method), "query")?.description;
  setWithComment(
    document,
    ["ingest", "with", "query"],
    replaceMe,
    typeof description === "string" ? description : "The query that reads the source",
  );
}

/**
 * Source options: a secret by name; text left out unless the connector needs it (`keep`),
 * then REPLACE_ME; anything else as the example writes it. Returns the text left out.
 */
function composeOptions(
  document: YamlDocument,
  facts: RecipeFacts,
  secretPrefix: string,
  keep: ReadonlySet<string>,
): string[] {
  const options = document.getIn(["ingest", "with", "source_options"]);
  if (!isMap(options)) return [];
  const schemas = (schemaOf(methodSettings(facts.route.method), "source_options")?.properties ??
    {}) as Record<string, Record<string, unknown>>;
  const leftOut: string[] = [];
  for (const pair of [...options.items]) {
    const key = String(isScalar(pair.key) ? pair.key.value : pair.key);
    const written = isScalar(pair.value) ? pair.value.value : undefined;
    const option = { key, written, schema: schemas[key] ?? {} };
    if (!composeOption(document, option, `${secretPrefix}-${key}`, keep.has(key)))
      leftOut.push(key);
  }
  return leftOut;
}

/** One source option; false when it is text left out. */
function composeOption(
  document: YamlDocument,
  { key, written, schema }: { key: string; written: unknown; schema: Record<string, unknown> },
  secret: string,
  keep: boolean,
): boolean {
  const keys = ["ingest", "with", "source_options", key];
  if (isSecret(written))
    setWithComment(document, keys, secretReference(secret), descriptionOf(schema));
  else if (!freeText(written, schema)) return true;
  else if (keep) setWithComment(document, keys, replaceMe, descriptionOf(schema));
  else {
    document.deleteIn(keys);
    return false;
  }
  return true;
}

function descriptionOf(schema: Record<string, unknown>): string | undefined {
  return typeof schema.description === "string" ? schema.description : undefined;
}

/** Text whose schema allows any value: only the owner knows it. */
function freeText(written: unknown, schema: Record<string, unknown>): boolean {
  return typeof written === "string" && !schema.enum && schema.const === undefined;
}

/** The JSON Schema of one of the method's settings. */
function schemaOf(
  settings: Record<string, unknown>,
  key: string,
): { description?: unknown; properties?: unknown } | undefined {
  return settings[key] as { description?: unknown; properties?: unknown } | undefined;
}
