// Reading a metadata document back: whether a parsed value is one the schema
// (source-metadata.schema.yaml) allows, for the keys the import reads.
import type { SourceColumnDoc, SourceMetadataDoc, SourceTableDoc } from "@ingestron/definitions";
import { isRecord } from "./records.js";

/** How deep a document read back may nest columns; a reader writes at most 16 levels. */
const deepest = 64;

/** A test of one value. */
type Test = (value: unknown) => boolean;

const logicalTypes = [
  "string",
  "date",
  "timestamp",
  "time",
  "number",
  "integer",
  "object",
  "array",
  "boolean",
];
const rungs = ["catalog", "document", "sample", "columns", "assistant"];

const text: Test = (value) => typeof value === "string" && value !== "";
const bool: Test = (value) => typeof value === "boolean";
const oneOf =
  (choices: readonly string[]): Test =>
  (value) =>
    typeof value === "string" && choices.includes(value);
/** A whole number from `least` to `most`. */
const whole =
  (least: number, most = Infinity): Test =>
  (value) =>
    typeof value === "number" && Number.isInteger(value) && value >= least && value <= most;
/** The key may be missing; when it is there, `test` holds. */
const optional =
  (test: Test): Test =>
  (value) =>
    value === undefined || test(value);

/** True when every key of `shape` holds for the record's value of it. */
function fits(value: unknown, shape: Record<string, Test>): value is Record<string, unknown> {
  return isRecord(value) && Object.entries(shape).every(([key, test]) => test(value[key]));
}

const stringOrNone = optional((value) => typeof value === "string");

/** Nested columns: none, or a list of columns for `properties`, or one column for `items`. */
function nestedAreColumns(value: Record<string, unknown>, depth: number): boolean {
  const { properties, items } = value;
  const listed =
    properties === undefined ||
    (Array.isArray(properties) && properties.every((column) => isColumn(column, depth + 1)));
  return listed && (items === undefined || isColumn(items, depth + 1));
}

/** A column with a name, a logical type and `required`, and its nested columns the same. */
function isColumn(value: unknown, depth = 0): value is SourceColumnDoc {
  const shape = {
    name: text,
    sourceType: stringOrNone,
    logicalType: oneOf(logicalTypes),
    logicalTypeOptions: optional(isRecord),
    required: bool,
    primaryKeyPosition: optional(whole(1)),
  };
  return depth <= deepest && fits(value, shape) && nestedAreColumns(value, depth);
}

const captured = {
  at: text,
  from: oneOf(rungs),
  recipe: stringOrNone,
  file: text,
};

/** A table with an object, where it was captured from and its columns. */
function isTable(value: unknown): value is SourceTableDoc {
  const shape = {
    object: text,
    captured: (it: unknown) => fits(it, captured),
    columns: (it: unknown) => Array.isArray(it) && it.every((column) => isColumn(column)),
  };
  return fits(value, shape);
}

/** The document's shape, apart from the connection and its tables, which are read on their own. */
const documentShape = {
  apiVersion: oneOf(["ingestron.io/v1"]),
  kind: oneOf(["SourceMetadata"]),
  description: stringOrNone,
  environment: stringOrNone,
  names: optional((it) => fits(it, { parts: whole(1, 4), caseSensitive: bool })),
  tables: (it: unknown) => Array.isArray(it) && it.every(isTable),
};

/** The parsed value as a document of the connection, or undefined when it is not one. */
export function metadataOf(value: unknown, connection: string): SourceMetadataDoc | undefined {
  if (!fits(value, documentShape) || value.connection !== connection) return undefined;
  const { names, tables } = value as {
    names?: SourceMetadataDoc["names"];
    tables: SourceTableDoc[];
  };
  return {
    id: connection,
    connection,
    ...(names && { names: { parts: names.parts, caseSensitive: names.caseSensitive } }),
    tables,
  };
}
