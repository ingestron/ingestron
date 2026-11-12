// The table of an Avro record schema (spec/cli/sources.md, section 2.4). Only the schema's shape is
// read: a field's `default`, `doc` and every other keyword that could hold a value are not.
import type { SourceColumnDoc } from "@ingestron/definitions";
import { isRecord, maxNesting } from "./records.js";
import type { Outcome } from "./result.js";
import { itemsName } from "./sample-columns.js";

type Data = Record<string, unknown>;

/** The named types of a schema: each by its full name, with the namespace it is in. */
interface Names {
  named: Map<string, Data>;
  spaces: Map<Data, string>;
}

/** What reading a column needs besides the column: its table, the notes, the named types and the records already written in full. */
interface Context extends Names {
  object: string;
  notes: string[];
  expanded: Set<Data>;
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

/** The namespace and full name of a named type found in namespace `space`. */
function fullNameOf(node: Data, space: string): { space: string; full: string } {
  const name = node.name as string;
  const dot = name.lastIndexOf(".");
  const own = typeof node.namespace === "string" ? node.namespace : space;
  const inside = dot >= 0 ? name.slice(0, dot) : own;
  return { space: inside, full: dot >= 0 || inside === "" ? name : `${inside}.${name}` };
}

/** Every record, enum and fixed the schema defines, wherever it is: fields, items, map values and unions. */
function collectNamed(node: unknown, space: string, names: Names): void {
  if (Array.isArray(node)) {
    for (const branch of node) collectNamed(branch, space, names);
    return;
  }
  if (!isRecord(node)) return;
  let inside = space;
  if (["record", "enum", "fixed"].includes(node.type as string) && typeof node.name === "string") {
    const found = fullNameOf(node, space);
    inside = found.space;
    names.named.set(found.full, node);
    names.spaces.set(node, inside);
  }
  collectNamed(node.type, inside, names);
  collectNamed(node.items, inside, names);
  collectNamed(node.values, inside, names);
  for (const field of Array.isArray(node.fields) ? node.fields : [])
    if (isRecord(field)) collectNamed(field.type, inside, names);
}

/** The type name that stands for a branch of a union, in a note. */
function nameOf(branch: unknown): string {
  if (typeof branch === "string") return branch;
  if (!isRecord(branch)) return "string";
  return typeof branch.type === "string" ? branch.type : "union";
}

const isNull = (branch: unknown): boolean =>
  branch === "null" || (isRecord(branch) && branch.type === "null");

/** The named type a reference means: looked up in `space`, then without a namespace. */
function lookup(name: string, space: string, names: Names): Data | undefined {
  const qualified = name.includes(".") || space === "" ? name : `${space}.${name}`;
  return names.named.get(qualified) ?? names.named.get(name);
}

/**
 * The type a field gives, with a nested `{"type": ...}` followed and a name that refers to a record
 * looked up in the namespace of the record `scope` that holds the field.
 */
function definition(type: unknown, context: Context, scope: Data): Data | string {
  let current = type;
  while (isRecord(current) && (isRecord(current.type) || Array.isArray(current.type)))
    current = current.type;
  if (typeof current === "string")
    return lookup(current, context.spaces.get(scope) ?? "", context) ?? current;
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

/**
 * The properties of a record, or the items of an array. A record is written in full once per
 * table, and nothing is written below the deepest level; each other use is bare, with the record's
 * name as its source type.
 */
function nestedOf(
  shape: Data,
  context: Context,
  path: string[],
  depth: number,
  scope: Data,
): Pick<SourceColumnDoc, "sourceType" | "properties" | "items"> {
  if (shape.type === "array")
    return {
      items: columnOf(itemsName, shape.items, context, [...path, itemsName], depth + 1, scope),
    };
  if (shape.type !== "record") return {};
  if (context.expanded.has(shape) || depth >= maxNesting) return { sourceType: String(shape.name) };
  context.expanded.add(shape);
  const properties = fieldsOf(shape, context, path, depth + 1);
  return properties.length > 0 ? { properties } : {};
}

function columnOf(
  name: string,
  type: unknown,
  context: Context,
  path: string[],
  depth: number,
  scope: Data,
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
  const shape = definition(others[0] ?? "null", context, scope);
  const nested = typeof shape === "string" ? {} : nestedOf(shape, context, path, depth, scope);
  return { name, ...describe(shape), required, ...nested };
}

/** The columns of a record's fields, at nesting level `depth`. */
function fieldsOf(
  record: Data,
  context: Context,
  parents: string[],
  depth: number,
): SourceColumnDoc[] {
  const fields = Array.isArray(record.fields) ? record.fields.filter(isRecord) : [];
  return fields.flatMap((field) =>
    typeof field.name === "string"
      ? [columnOf(field.name, field.type, context, [...parents, field.name], depth, record)]
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
    return { refused: [`${file} is not an Avro schema: its top-level type is not record.`] };
  const context: Context = {
    object: object ?? (schema.name as string),
    notes: [],
    named: new Map(),
    spaces: new Map(),
    expanded: new Set([schema]),
  };
  collectNamed(schema, "", context);
  const columns = fieldsOf(schema, context, [], 0);
  if (columns.length === 0) return { refused: [`${file} describes no fields.`] };
  return { tables: [{ object: context.object, columns }], notes: context.notes };
}
