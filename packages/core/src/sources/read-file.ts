// Choosing the reader for a file (spec/cli/sources.md, section 2.5).
import type { SourceReaderName, SourceRecipe } from "./recipe.js";
import { readers, documentReaders } from "./readers.js";
import {
  isRefused,
  type CapturedFrom,
  type ReaderInput,
  type Refused,
  type SourceRead,
} from "./result.js";
import { decodeText, extensionOf, once, parseJson, parseXml, parseYaml } from "./text.js";

/** A reader to try: what it is called, the rung its tables are from and what it is given. */
interface Attempt {
  reader: SourceReaderName;
  from: CapturedFrom;
  input: ReaderInput;
}

const nameRules = new Set(["columns", "assistant", "odcs", "catalog"]);

/** The path below `sources/<connection>/`, for the connection being imported, else undefined. */
function underConnection(file: string, connection: string | undefined): boolean {
  const parts = file.split("/");
  return (
    parts[0] === "sources" &&
    parts.length >= 3 &&
    (connection === undefined || parts[1] === connection)
  );
}

/** What the file's last two extensions say: `erp.columns.csv` is `columns`. */
function nameRule(file: string, connection: string | undefined): string | undefined {
  if (underConnection(file, connection)) return undefined;
  const parts = (file.split("/").pop() ?? "").split(".");
  const marker = parts[parts.length - 2];
  return parts.length >= 3 && marker !== undefined && nameRules.has(marker) ? marker : undefined;
}

/** The recipe without the fields that read a catalog result, which a name rule leaves out. */
function typesOnly(recipe: SourceRecipe | undefined): SourceRecipe | undefined {
  if (recipe === undefined) return undefined;
  const plain = { ...recipe };
  delete plain.rows;
  delete plain.fields;
  delete plain.key;
  return plain;
}

/** The one reader a name rule allows, or the refusal when it cannot be used. */
function forced(rule: string, base: ReaderInput, recipe?: SourceRecipe): Attempt | Refused {
  const plain = { ...base, recipe: typesOnly(recipe) };
  if (rule === "columns") return { reader: "columns", from: "columns", input: plain };
  if (rule === "assistant") return { reader: "columns", from: "assistant", input: plain };
  if (rule === "odcs") return { reader: "odcs", from: "document", input: base };
  if (recipe === undefined)
    return { refused: [`${base.file} is a catalog result, but no recipe was given to read it.`] };
  return { reader: recipe.read, from: recipe.kind, input: { ...base, recipe } };
}

/** The readers to try in order, when the name does not decide. */
function attempts(base: ReaderInput, recipe?: SourceRecipe): Attempt[] {
  const plain = { ...base, recipe: typesOnly(recipe) };
  return [
    ...(recipe ? [{ reader: recipe.read, from: recipe.kind, input: { ...base, recipe } }] : []),
    { reader: "columns" as const, from: "columns" as const, input: plain },
    { reader: "odcs" as const, from: "document" as const, input: base },
    ...documentReaders.map((reader) => ({ reader, from: "document" as const, input: plain })),
    { reader: "sample" as const, from: "sample" as const, input: base },
  ];
}

function notRead(file: string): Refused {
  return {
    refused: [
      `${file} is not a file Ingestron reads: a columns file, an ODCS contract, OData CSDL, OpenAPI, JSON Schema, Avro, a schema registry response, a Salesforce describe, or a sample ending .csv, .json, .jsonl, .ndjson or .parquet.`,
    ],
  };
}

/**
 * Reads a source file: the recipe's reader when it accepts the file, then the columns reader, an
 * ODCS contract, the readers of documents a source publishes, and a sample by its extension. A
 * file name that ends `.columns.<ext>`, `.assistant.<ext>`, `.odcs.<ext>` or `.catalog.<ext>`
 * decides the reader alone, unless the file is under `sources/<connection>/`, which names an
 * object. The result names the tables, or the reasons the file is refused.
 * @internal
 */
export function readSourceFile(input: {
  file: string;
  contents: string | Uint8Array;
  recipe?: SourceRecipe;
  object?: string;
  /** The connection being imported, so that only its folder under `sources/` names an object. */
  connection?: string;
}): SourceRead | Refused {
  const { file, contents, recipe, object, connection } = input;
  const bytes = typeof contents === "string" ? new TextEncoder().encode(contents) : contents;
  const text = extensionOf(file) === ".parquet" ? "" : decodeText(contents);
  const json = once(() => parseJson(text, file));
  const yaml = once(() => parseYaml(text, file));
  const xml = once(() => parseXml(text, file));
  const base: ReaderInput = {
    file,
    bytes,
    text,
    json,
    yaml,
    xml,
    ...(object !== undefined && { object }),
  };
  const rule = nameRule(file, connection);
  const chosen =
    rule === undefined
      ? attempts(base, recipe).find((attempt) => readers[attempt.reader].accepts(attempt.input))
      : forced(rule, base, recipe);
  if (chosen === undefined) return notRead(file);
  if ("refused" in chosen) return chosen;
  const { reader, from, input: given } = chosen;
  const outcome = readers[reader].read(given);
  return isRefused(outcome) ? outcome : { reader, from, ...outcome };
}
