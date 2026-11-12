// The table of an Avro record schema (spec/cli/sources.md, section 2.4). Only the schema's shape is
// read: a field's `default`, `doc` and every other keyword that could hold a value are not.
import type { SourceColumnDoc } from "@ingestron/definitions";
import { isRecord } from "./records.js";
import type { Outcome } from "./result.js";
import { itemsName } from "./sample-columns.js";

type Data = Record<string, unknown>;

/** What reading a column needs besides the column: its table, the notes and the named types. */
interface Context {
  object: string;
  notes: string[];
  named: Map<string, Data>;
}

const byKind: Record<string, string> = {
  int: "integer",
  long: "integer",
  float: "number",
  double: "number",
  boolean: "boolean",
  map: "object",
  record: "object",
  array: "array",
};

function byLogical(logical: string): string | undefined {
  if (logical === "decimal") return "number";
  if (logical === "date") return "date";
  if (/^(local-)?timestamp-/.test(logical)) return "timestamp";
  return /^time-/.test(logical) ? "time" : undefined;
}

/** Every record, enum and fixed the schema defines, by name and by full name. */
function collectNamed(node: unknown, named: Map<string, Data>): void {
  if (Array.isArray(node)) {
    for (const branch of node) collectNamed(branch, named);
  } else if (isRecord(node)) {
    if (
      ["record", "enum", "fixed"].includes(node.type as string) &&
      typeof node.name === "string"
    ) {
      named.set(node.name, node);
      if (typeof node.namespace === "string") named.set(`${node.namespace}.${node.name}`, node);
    }
    collectNamed(node.type, named);
    collectNamed(node.items, named);
    for (const field of Array.isArray(node.fields) ? node.fields : [])
      if (isRecord(field)) collectNamed(field.type, named);
  }
}

/** The type name that stands for a branch of a union, in a note. */
function nameOf(branch: unknown): string {
  if (typeof branch === "string") return branch;
  if (!isRecord(branch)) return "string";
  return typeof branch.type === "string" ? branch.type : "union";
}

const isNull = (branch: unknown): boolean =>
  branch === "null" || (isRecord(branch) && branch.type === "null");

/** The type a field gives, with a nested `{"type": ...}` and a name that refers to a record followed. */
function definition(type: unknown, context: Context): Data | string {
  let current = type;
  while (isRecord(current) && (isRecord(current.type) || Array.isArray(current.type)))
    current = current.type;
  if (typeof current === "string") return context.named.get(current) ?? current;
  return isRecord(current) ? current : "string";
}

/** The options of a decimal: its precision, and its scale, which is 0 when the schema gives none. */
function decimalOptions(shape: Data): Record<string, unknown> | undefined {
  return typeof shape.precision === "number"
    ? { precision: shape.precision, scale: typeof shape.scale === "number" ? shape.scale : 0 }
    : undefined;
}

/** The source type, logical type and options of a type that is not a union. */
function describe(shape: Data | string): Omit<SourceColumnDoc, "name" | "required"> {
  if (typeof shape === "string")
    return { sourceType: shape, logicalType: byKind[shape] ?? "string" };
  const kind = String(shape.type);
  const logical = typeof shape.logicalType === "string" ? shape.logicalType : undefined;
  const options = logical === "decimal" ? decimalOptions(shape) : undefined;
  return {
    sourceType: logical ?? kind,
    logicalType: (logical && byLogical(logical)) ?? byKind[kind] ?? "string",
    ...(options && { logicalTypeOptions: options }),
  };
}

/** The properties of a record, or the items of an array, with a record that repeats left bare. */
function nestedOf(
  shape: Data,
  context: Context,
  path: string[],
  trail: Data[],
): Pick<SourceColumnDoc, "properties" | "items"> {
  if (shape.type === "array")
    return { items: columnOf(itemsName, shape.items, context, [...path, itemsName], trail) };
  if (shape.type !== "record" || trail.includes(shape)) return {};
  const properties = fieldsOf(shape, context, path, [...trail, shape]);
  return properties.length > 0 ? { properties } : {};
}

function columnOf(
  name: string,
  type: unknown,
  context: Context,
  path: string[],
  trail: Data[],
): SourceColumnDoc {
  const branches = Array.isArray(type) ? type : [type];
  const others = branches.filter((branch) => !isNull(branch));
  const required = others.length === branches.length;
  if (others.length > 1) {
    const types = others.map(nameOf).join(", ");
    context.notes.push(
      `The column ${context.object}.${path.join(".")} is a union of ${types}; read as string.`,
    );
    return { name, sourceType: "union", logicalType: "string", required };
  }
  const shape = definition(others[0] ?? "null", context);
  const nested = typeof shape === "string" ? {} : nestedOf(shape, context, path, trail);
  return { name, ...describe(shape), required, ...nested };
}

function fieldsOf(
  record: Data,
  context: Context,
  parents: string[],
  trail: Data[],
): SourceColumnDoc[] {
  const fields = Array.isArray(record.fields) ? record.fields.filter(isRecord) : [];
  return fields.flatMap((field) =>
    typeof field.name === "string"
      ? [columnOf(field.name, field.type, context, [...parents, field.name], trail)]
      : [],
  );
}

/** The table of an Avro schema whose top-level type is `record`, named by `object` or its own name. */
export function avroOutcome(file: string, schema: unknown, object: string | undefined): Outcome {
  if (
    !isRecord(schema) ||
    schema.type !== "record" ||
    (object === undefined && typeof schema.name !== "string")
  )
    return {
      refused: [`${file} is not an Avro schema: its top-level type is not record.`],
    };
  const context: Context = {
    object: object ?? (schema.name as string),
    notes: [],
    named: new Map(),
  };
  collectNamed(schema, context.named);
  const columns = fieldsOf(schema, context, [], [schema]);
  if (columns.length === 0) return { refused: [`${file} describes no fields.`] };
  return { tables: [{ object: context.object, columns }], notes: context.notes };
}
