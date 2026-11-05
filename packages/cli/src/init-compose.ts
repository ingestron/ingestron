// A connection-first project's values: REPLACE_ME where Ingestron cannot know a value, the
// written defaults with a comment, and secret names (spec/cli/projects.md). Every fact
// comes from the connector's metadata and the method's settings schema.
import type { Connector } from "@ingestron/definitions";
import { isMap, isScalar } from "yaml";
import {
  commentAfter,
  commentText,
  editYaml,
  replaceMe,
  setWithComment,
  shapedPlaceholder,
  type YamlDocument,
} from "./init-yaml.js";
import { composePlatform, composeStandard, methodSettings, type Route } from "./init-platform.js";
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
}

type Setting = Connector["settings"][number];

/** How a connectivity is reached, for the comment beside it. */
const reached: Record<string, string> = {
  private: "reached only through a self-hosted integration runtime or a private network",
  workspace: "reached from the workspace's own network",
  public: "reached over the internet",
};

/** Writes the recipe's values as a new project has them; the files are edited in place. */
export function composeRecipe(
  files: Record<string, Content>,
  facts: RecipeFacts,
  composing: Composing,
): void {
  let connectionId = "";
  editYaml(files, facts.connection, (document) => {
    connectionId = String(document.get("id"));
    composeConnection(document, facts.connector, `${composing.project}-${connectionId}`);
  });
  const secret = `${composing.project}-${connectionId}`;
  for (const flow of facts.flows)
    editYaml(files, flow, (document) => composeFlow(document, facts, secret));
  composePlatform(files, facts.route, composing);
  composeStandard(files, facts.route, composing);
}

/** The connection's settings: secrets by name, defaults, and REPLACE_ME for the rest. */
function composeConnection(
  document: YamlDocument,
  connector: Connector | undefined,
  secretPrefix: string,
): void {
  const connectivity = String(document.get("connectivity"));
  if (reached[connectivity]) commentAfter(document, ["connectivity"], reached[connectivity]);
  const settings = document.get("settings");
  if (!isMap(settings)) return;
  for (const pair of settings.items) {
    const key = String(isScalar(pair.key) ? pair.key.value : pair.key);
    const written = isScalar(pair.value) ? pair.value.value : undefined;
    const meta = connector?.settings.find((setting) => setting.name === key);
    const value = settingValue(written, meta, `${secretPrefix}-${key}`);
    const comment = meta ? describe(meta, value) : undefined;
    setWithComment(document, ["settings", key], value, comment);
  }
}

/** A setting's value by its metadata: a secret, a default, or REPLACE_ME. */
function settingValue(written: unknown, meta: Setting | undefined, secret: string): unknown {
  if (meta?.secret || isSecret(written)) return secretReference(secret);
  if (meta?.default !== undefined) return meta.default;
  return kept(written, meta) ? written : replaceMe;
}

/**
 * Without a default in the metadata, the example's value stays where it is one of a kind
 * (a number, true or false, or one of the allowed values), or where it says what to write:
 * a value read from project.yaml, or one already REPLACE_ME.
 */
function kept(written: unknown, meta: Setting | undefined): boolean {
  if (typeof written !== "string") return true;
  if (meta?.values?.includes(written)) return true;
  return written.includes("${") || written.includes(replaceMe);
}

function isSecret(value: unknown): boolean {
  return typeof value === "string" && value.startsWith("${secret:");
}

/** `${secret:<name>}`, each `_` written `-`. */
export function secretReference(name: string): string {
  return `\${secret:${name.replaceAll("_", "-")}}`;
}

function describe(meta: Setting, value: unknown): string {
  const text = commentText(meta.description);
  return typeof value === "string" && value.startsWith("${secret:")
    ? commentText(`Key Vault secret: ${text.charAt(0).toLowerCase()}${text.slice(1)}`)
    : text;
}

/** A flow: its method, each table's object, a required query, and its source options. */
function composeFlow(document: YamlDocument, facts: RecipeFacts, secretPrefix: string): void {
  commentAfter(
    document,
    ["ingest", "uses"],
    "the route's ingest method; a table may choose another",
  );
  composeObjects(document, facts.connector?.object ?? "");
  composeQuery(document, facts);
  composeOptions(document, facts, secretPrefix);
  const settings = document.getIn(["ingest", "with"]);
  if (isMap(settings) && settings.items.length === 0) document.deleteIn(["ingest", "with"]);
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
    const comment = `The source object${shape ? `: ${shape}` : ""}`;
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

/** Source options: a default where the schema allows only some values, else by type. */
function composeOptions(document: YamlDocument, facts: RecipeFacts, secretPrefix: string): void {
  const options = document.getIn(["ingest", "with", "source_options"]);
  if (!isMap(options)) return;
  const schemas = (schemaOf(methodSettings(facts.route.method), "source_options")?.properties ??
    {}) as Record<string, Record<string, unknown>>;
  for (const pair of [...options.items]) {
    const key = String(isScalar(pair.key) ? pair.key.value : pair.key);
    const written = isScalar(pair.value) ? pair.value.value : undefined;
    const schema = schemas[key] ?? {};
    const value = optionValue(written, schema, `${secretPrefix}-${key}`);
    const keys = ["ingest", "with", "source_options", key];
    if (value !== undefined) setWithComment(document, keys, value, descriptionOf(schema));
  }
}

function descriptionOf(schema: Record<string, unknown>): string | undefined {
  return typeof schema.description === "string" ? schema.description : undefined;
}

/** A source option's new value: a secret by name, REPLACE_ME for free text, else unchanged. */
function optionValue(written: unknown, schema: Record<string, unknown>, secret: string) {
  if (isSecret(written)) return secretReference(secret);
  if (typeof written !== "string" || schema.enum || schema.const !== undefined) return undefined;
  return replaceMe;
}

/** The JSON Schema of one of the method's settings. */
function schemaOf(
  settings: Record<string, unknown>,
  key: string,
): { description?: unknown; properties?: unknown } | undefined {
  return settings[key] as { description?: unknown; properties?: unknown } | undefined;
}
