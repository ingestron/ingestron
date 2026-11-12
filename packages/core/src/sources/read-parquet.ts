// A Parquet sample, read from its footer only: the schema, never the rows
// (spec/cli/sources.md, section 2.2).
import type { SourceColumnDoc } from "@ingestron/definitions";
import { parquetMetadata, parquetSchema, type SchemaElement, type SchemaTree } from "hyparquet";
import type { ReaderInput, Refused } from "./result.js";
import { itemsName } from "./sample-columns.js";

const byAnnotation: Record<string, string> = {
  DATE: "date",
  TIMESTAMP: "timestamp",
  TIME: "time",
  STRING: "string",
  INTEGER: "integer",
};
const byPhysical: Record<string, string> = {
  BOOLEAN: "boolean",
  INT32: "integer",
  INT64: "integer",
  FLOAT: "number",
  DOUBLE: "number",
  INT96: "timestamp",
};

/** The field's logical annotation, from its logical type or, for an older file, its converted type. */
function annotationOf(element: SchemaElement): string | undefined {
  if (element.logical_type) return element.logical_type.type;
  const converted = element.converted_type;
  if (converted === undefined) return undefined;
  if (converted === "UTF8") return "STRING";
  if (converted.startsWith("TIME_")) return "TIME";
  if (converted.startsWith("TIMESTAMP_")) return "TIMESTAMP";
  return /^U?INT_/.test(converted) ? "INTEGER" : converted;
}

/** The precision and scale of a decimal field; a scale the file does not give is 0. */
function decimalOptions(element: SchemaElement): Record<string, number> {
  const { precision, scale } =
    element.logical_type?.type === "DECIMAL" ? element.logical_type : element;
  return { ...(precision !== undefined && { precision }), scale: scale ?? 0 };
}

/** A field with a physical type: its annotation decides its type, else its physical type does. */
function primitive(element: SchemaElement): Omit<SourceColumnDoc, "required"> {
  const annotation = annotationOf(element);
  const physical = element.type ?? "BYTE_ARRAY";
  const sourceType = annotation === undefined ? physical : `${physical}(${annotation})`;
  const logicalType = (annotation && byAnnotation[annotation]) ?? byPhysical[physical] ?? "string";
  const base = { name: element.name, sourceType, logicalType };
  return annotation === "DECIMAL"
    ? { ...base, logicalType: "number", logicalTypeOptions: decimalOptions(element) }
    : base;
}

/** A field's shape, whatever its repetition. */
function shapeOf(tree: SchemaTree): Omit<SourceColumnDoc, "required"> {
  const { element, children } = tree;
  if (children.length === 0) return primitive(element);
  const annotation = annotationOf(element);
  if (annotation === "MAP") return { name: element.name, logicalType: "object" };
  if (annotation !== "LIST")
    return { name: element.name, logicalType: "object", properties: columnsOf(children) };
  const repeated = children[0]!;
  const inner = repeated.children.length === 1 ? repeated.children[0]! : undefined;
  const items = inner
    ? { ...columnOf(inner), name: itemsName }
    : { ...shapeOf(repeated), name: itemsName, required: false };
  return { name: element.name, logicalType: "array", items };
}

function columnOf(tree: SchemaTree): SourceColumnDoc {
  const shape = shapeOf(tree);
  if (tree.element.repetition_type === "REPEATED")
    return {
      name: shape.name,
      logicalType: "array",
      required: false,
      items: { ...shape, name: itemsName, required: false },
    };
  return { ...shape, required: tree.element.repetition_type === "REQUIRED" };
}

/** The fields as columns; a field with an empty name is not a column. */
function columnsOf(fields: SchemaTree[]): SourceColumnDoc[] {
  return fields.filter((field) => field.element.name !== "").map(columnOf);
}

/** The columns of a Parquet file's schema, or the refusal when its footer cannot be read. */
export function readParquet(input: ReaderInput): SourceColumnDoc[] | Refused {
  try {
    const columns = columnsOf(parquetSchema(parquetMetadata(input.bytes)).children);
    return columns.length === 0 ? { refused: [`${input.file} has no columns.`] } : columns;
  } catch {
    return { refused: [`${input.file} is not a Parquet file Ingestron can read.`] };
  }
}
