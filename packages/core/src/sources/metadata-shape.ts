// Reading a metadata document back: whether a parsed value is one the schema
// (source-metadata.schema.yaml) allows, for the keys the import reads, and, when it is not, the
// first field that fails and the rule it breaks. A reason holds a field's path and a rule, never
// a value from the document.
import type { SourceMetadataDoc, SourceTableDoc } from "@ingestron/definitions";
import { isRecord } from "./records.js";

/** How deep a document read back may nest columns; a reader writes at most 16 levels. */
const deepest = 64;

/** A test of one value, and the rule it states, as in `<field> must be text`. */
interface Test {
  holds: (value: unknown) => boolean;
  rule: string;
}

/** What a document's value failed: the field's path and the rule. */
type Reason = string;

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

const text: Test = {
  holds: (value) => typeof value === "string" && value !== "",
  rule: "must be text",
};
const bool: Test = { holds: (value) => typeof value === "boolean", rule: "must be true or false" };
const mapping: Test = { holds: isRecord, rule: "must be a mapping" };
const oneOf = (choices: readonly string[]): Test => ({
  holds: (value) => typeof value === "string" && choices.includes(value),
  rule: `must be one of ${choices.join(", ")}`,
});
/** A whole number from `least` to `most`. */
const whole = (least: number, most = Infinity): Test => ({
  holds: (value) =>
    typeof value === "number" && Number.isInteger(value) && value >= least && value <= most,
  rule: `must be a whole number from ${least}${most === Infinity ? "" : ` to ${most}`}`,
});
/** The key may be missing; when it is there, `test` holds. */
const optional = (test: Test): Test => ({
  holds: (value) => value === undefined || test.holds(value),
  rule: test.rule,
});

/** A key of a record, its test, or a test of the whole value that gives its own reason. */
type Shape = Record<string, Test | ((value: unknown, path: string) => Reason | undefined)>;

/** The first key of `shape`, in its order, that the record fails, or undefined when it fits. */
function problemOf(value: unknown, shape: Shape, path: string): Reason | undefined {
  if (!isRecord(value)) return `${path || "the document"} must be a mapping`;
  for (const [key, test] of Object.entries(shape)) {
    const where = path === "" ? key : `${path}.${key}`;
    if (typeof test === "function") {
      const reason = test(value[key], where);
      if (reason !== undefined) return reason;
    } else if (!test.holds(value[key])) return `${where} ${test.rule}`;
  }
  return undefined;
}

const stringOrNone = optional({
  holds: (value) => typeof value === "string",
  rule: "must be text",
});

/** The nested columns of a column: `properties`, a list of columns, and `items`, one column. */
function nestedProblem(value: Record<string, unknown>, path: string, depth: number) {
  const { properties, items } = value;
  if (properties !== undefined) {
    if (!Array.isArray(properties)) return `${path}.properties must be a list`;
    for (const [index, column] of properties.entries()) {
      const reason = columnProblem(column, `${path}.properties[${index}]`, depth + 1);
      if (reason !== undefined) return reason;
    }
  }
  return items === undefined ? undefined : columnProblem(items, `${path}.items`, depth + 1);
}

/** What is wrong with a column: a name, a logical type and `required`, and its nested columns. */
function columnProblem(value: unknown, path: string, depth = 0): Reason | undefined {
  if (depth > deepest) return `${path} is nested too deeply`;
  const shape: Shape = {
    name: text,
    sourceType: stringOrNone,
    logicalType: oneOf(logicalTypes),
    logicalTypeOptions: optional(mapping),
    required: bool,
    primaryKeyPosition: optional(whole(1)),
  };
  return (
    problemOf(value, shape, path) ?? nestedProblem(value as Record<string, unknown>, path, depth)
  );
}

/** What is wrong with a list: it is none, or the first of its items `problem` finds fault with. */
function listProblem(
  value: unknown,
  path: string,
  problem: (item: unknown, where: string) => Reason | undefined,
): Reason | undefined {
  if (!Array.isArray(value)) return `${path} must be a list`;
  for (const [index, item] of value.entries()) {
    const reason = problem(item, `${path}[${index}]`);
    if (reason !== undefined) return reason;
  }
  return undefined;
}

const captured: Shape = { at: text, from: oneOf(rungs), recipe: stringOrNone, file: text };

/** What is wrong with a table: an object, where it was captured from and its columns. */
function tableProblem(value: unknown, path: string): Reason | undefined {
  const shape: Shape = {
    object: text,
    captured: (it, where) => problemOf(it, captured, where),
    columns: (it, where) => listProblem(it, where, columnProblem),
  };
  return problemOf(value, shape, path);
}

/** The document's shape, apart from the connection, which is read on its own. */
const documentShape = (connection: string): Shape => ({
  apiVersion: oneOf(["ingestron.io/v1"]),
  kind: oneOf(["SourceMetadata"]),
  connection: { holds: (it) => it === connection, rule: `must be ${connection}` },
  description: stringOrNone,
  environment: stringOrNone,
  names: (it, where) =>
    it === undefined
      ? undefined
      : problemOf(it, { parts: whole(1, 4), caseSensitive: bool }, where),
  tables: (it, where) => listProblem(it, where, tableProblem),
});

/**
 * The parsed value as a document of the connection, or the first field that fails and the rule it
 * breaks, as `tables[0].columns[1].logicalType must be one of string, date, …`.
 */
export function metadataOf(
  value: unknown,
  connection: string,
): SourceMetadataDoc | { problem: Reason } {
  const problem = problemOf(value, documentShape(connection), "");
  if (problem !== undefined) return { problem };
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
