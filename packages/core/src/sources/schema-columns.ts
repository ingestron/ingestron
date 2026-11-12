// The columns of a JSON Schema, which OpenAPI and a schema registry's JSON Schema share
// (spec/cli/sources.md, section 2.4). Only the schema's shape is read: no `enum`, `default`,
// `example` or other keyword that could hold a value of the data.
import type { SourceColumnDoc } from "@ingestron/definitions";
import { isRecord } from "./records.js";
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

/** The schema a node is, after following its `$ref`s, and the refs followed on the way. */
function resolve(
  node: unknown,
  root: unknown,
  trail: string[],
): { schema: Data; trail: string[]; repeated: boolean } {
  let schema = isRecord(node) ? node : {};
  let followed = trail;
  while (typeof schema.$ref === "string") {
    if (followed.includes(schema.$ref))
      return { schema: { type: "object" }, trail, repeated: true };
    followed = [...followed, schema.$ref];
    const target = pointerTarget(root, schema.$ref);
    schema = isRecord(target) ? target : {};
  }
  return { schema, trail: followed, repeated: false };
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

/** The properties of an object schema, or the items of an array schema. */
function nestedOf(
  type: string | undefined,
  schema: Data,
  repeated: boolean,
  root: unknown,
  trail: string[],
): Pick<SourceColumnDoc, "logicalType" | "properties" | "items"> | undefined {
  if (type === "object") {
    const properties = repeated ? [] : columnsOf(schema.properties, schema.required, root, trail);
    return { logicalType: "object", ...(properties.length > 0 && { properties }) };
  }
  if (type !== "array") return undefined;
  return {
    logicalType: "array",
    ...(isRecord(schema.items) && {
      items: columnOf(itemsName, schema.items, false, root, trail),
    }),
  };
}

function columnOf(
  name: string,
  node: unknown,
  required: boolean,
  root: unknown,
  trail: string[],
): SourceColumnDoc {
  const { schema, trail: followed, repeated } = resolve(node, root, trail);
  const type = typeOf(schema);
  const format = typeof schema.format === "string" ? schema.format : undefined;
  const shape = nestedOf(type, schema, repeated, root, followed) ?? scalarOf(type, format, schema);
  return {
    name,
    ...(type !== undefined && { sourceType: format === undefined ? type : `${type}(${format})` }),
    ...shape,
    required,
  };
}

/** The columns of a schema's `properties`, each required when `required` lists it. */
export function columnsOf(
  properties: unknown,
  required: unknown,
  root: unknown,
  trail: string[],
): SourceColumnDoc[] {
  if (!isRecord(properties)) return [];
  const names = Array.isArray(required) ? required : [];
  return Object.entries(properties).map(([name, schema]) =>
    columnOf(name, schema, names.includes(name), root, trail),
  );
}

/** True for a schema that is an object with at least one property. */
export function describesProperties(schema: unknown): schema is Data {
  return (
    isRecord(schema) &&
    isRecord(schema.properties) &&
    Object.keys(schema.properties).length > 0 &&
    (schema.type === undefined || schema.type === "object")
  );
}

/** The table of a JSON Schema document: its `properties` as columns. */
export function schemaOutcome(file: string, object: string, schema: Data): Outcome {
  if (!isRecord(schema.properties) || Object.keys(schema.properties).length === 0)
    return { refused: [`${file} describes no properties.`] };
  return {
    tables: [{ object, columns: columnsOf(schema.properties, schema.required, schema, []) }],
    notes: [],
  };
}
