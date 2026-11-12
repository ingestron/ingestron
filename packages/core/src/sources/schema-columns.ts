// The columns of a JSON Schema, which OpenAPI and a schema registry's JSON Schema share
// (spec/cli/sources.md, section 2.4). Only the schema's shape is read: no `enum`, `default`,
// `example` or other keyword that could hold a value of the data.
import type { SourceColumnDoc } from "@ingestron/definitions";
import { isRecord, maxNesting } from "./records.js";
import type { Outcome } from "./result.js";
import { itemsName } from "./sample-columns.js";

type Data = Record<string, unknown>;

/** A logical type with the options that go with it. */
type Scalar = Pick<SourceColumnDoc, "logicalType" | "logicalTypeOptions">;

const byFormat: Record<string, string> = {
  date: "date",
  "date-time": "timestamp",
  time: "time",
};

/** The schema a `$ref` within the file names, such as `#/components/schemas/Address`. */
function pointerTarget(root: unknown, ref: string): unknown {
  if (!ref.startsWith("#")) return undefined;
  let value = root;
  for (const part of ref.slice(1).split("/").slice(1)) {
    let key = part.replace(/~1/g, "/").replace(/~0/g, "~");
    try {
      key = decodeURIComponent(key);
    } catch {
      // A key that is not percent-encoded is used as written.
    }
    if (!isRecord(value) || !Object.hasOwn(value, key)) return undefined;
    value = value[key];
  }
  return value;
}

/** The type a schema declares: a list gives its first type other than `"null"`. */
function typeOf(schema: Data): string | undefined {
  const declared = Array.isArray(schema.type)
    ? schema.type.find((type) => type !== "null")
    : schema.type;
  if (typeof declared === "string") return declared;
  if (isRecord(schema.properties)) return "object";
  return isRecord(schema.items) ? "array" : undefined;
}

/** The schema a node is after following its `$ref`s, and the name its first `$ref` gives it. */
function resolve(node: unknown, root: unknown): { schema: Data; name?: string } {
  let schema = isRecord(node) ? node : {};
  const followed: string[] = [];
  while (typeof schema.$ref === "string") {
    if (followed.includes(schema.$ref))
      return { schema: { type: "object" }, name: nameOf(followed) };
    followed.push(schema.$ref);
    const target = pointerTarget(root, schema.$ref);
    schema = isRecord(target) ? target : {};
  }
  return { schema, ...(followed.length > 0 && { name: nameOf(followed) }) };
}

/** The last part of the first `$ref` followed, such as `Address`. */
function nameOf(followed: string[]): string {
  const ref = followed[0]!;
  return ref.slice(ref.lastIndexOf("/") + 1);
}

/** What reading one table needs: the document, and the schemas reached by `$ref` already written in full. */
interface Walk {
  root: unknown;
  expanded: Set<Data>;
}

/** The logical type of a schema that is not an object or an array. */
function scalarOf(type: string | undefined, format: string | undefined, schema: Data): Scalar {
  if (type === "integer" || type === "number" || type === "boolean") return { logicalType: type };
  const formatted = type === "string" && format !== undefined ? byFormat[format] : undefined;
  if (formatted !== undefined) return { logicalType: formatted };
  const maxLength = type === "string" ? schema.maxLength : undefined;
  return {
    logicalType: "string",
    ...(typeof maxLength === "number" && { logicalTypeOptions: { maxLength } }),
  };
}

/**
 * The properties of an object schema, or the items of an array schema. A schema reached by `$ref`
 * is written in full once per table, and nothing is written below the deepest level; each other
 * use is bare, with the `$ref`'s name as its source type.
 */
function nestedOf(
  type: "object" | "array",
  schema: Data,
  name: string | undefined,
  walk: Walk,
  depth: number,
): Pick<SourceColumnDoc, "logicalType" | "sourceType" | "properties" | "items"> {
  if ((name !== undefined && walk.expanded.has(schema)) || depth >= maxNesting)
    return { logicalType: type, ...(name !== undefined && { sourceType: name }) };
  if (name !== undefined) walk.expanded.add(schema);
  if (type === "array")
    return {
      logicalType: "array",
      ...(isRecord(schema.items) && {
        items: columnOf(itemsName, schema.items, false, walk, depth + 1),
      }),
    };
  const properties = columnsOf(schema.properties, schema.required, walk, depth + 1);
  return { logicalType: "object", ...(properties.length > 0 && { properties }) };
}

function columnOf(
  name: string,
  node: unknown,
  required: boolean,
  walk: Walk,
  depth: number,
): SourceColumnDoc {
  const { schema, name: refName } = resolve(node, walk.root);
  const type = typeOf(schema);
  const format = typeof schema.format === "string" ? schema.format : undefined;
  const shape =
    type === "object" || type === "array"
      ? nestedOf(type, schema, refName, walk, depth)
      : scalarOf(type, format, schema);
  return {
    name,
    ...(type !== undefined && { sourceType: format === undefined ? type : `${type}(${format})` }),
    ...shape,
    required,
  };
}

/** The columns of a schema's `properties`, each required when `required` lists it. */
function columnsOf(
  properties: unknown,
  required: unknown,
  walk: Walk,
  depth: number,
): SourceColumnDoc[] {
  if (!isRecord(properties)) return [];
  const names = Array.isArray(required) ? required : [];
  return Object.entries(properties)
    .filter(([name]) => name !== "")
    .map(([name, schema]) => columnOf(name, schema, names.includes(name), walk, depth));
}

/** The columns of a table: the schema's `properties`, in the document `root` that its `$ref`s name. */
export function tableColumns(schema: Data, root: unknown): SourceColumnDoc[] {
  return columnsOf(schema.properties, schema.required, { root, expanded: new Set([schema]) }, 0);
}

/** True for a schema that is an object with at least one named property. */
export function describesProperties(schema: unknown): schema is Data {
  return (
    isRecord(schema) &&
    isRecord(schema.properties) &&
    Object.keys(schema.properties).some((name) => name !== "") &&
    typeOf(schema) === "object"
  );
}

/** The table of a JSON Schema document: its `properties` as columns. */
export function schemaOutcome(file: string, object: string, schema: Data): Outcome {
  const columns = tableColumns(schema, schema);
  if (columns.length === 0) return { refused: [`${file} describes no properties.`] };
  return { tables: [{ object, columns }], notes: [] };
}
