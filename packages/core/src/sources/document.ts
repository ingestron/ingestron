// A connection's metadata document as text: read back for an import, and written so a new
// import shows as a small diff (spec/cli/sources.md, section 3, "The document").
import type { SourceColumnDoc, SourceMetadataDoc, SourceTableDoc } from "@ingestron/definitions";
import { parse } from "yaml";
import { isRecord } from "./records.js";
import { flowMapping, yamlText, yamlValue } from "./yaml-value.js";

const header = "# Written by ingestron source import. Do not edit: import again to replace it.";

/** A column's keys, in the order they are written; `properties` and `items` come after them. */
const columnKeys = [
  "name",
  "sourceType",
  "logicalType",
  "logicalTypeOptions",
  "required",
  "primaryKeyPosition",
] as const;

/** How deep a document read back may nest columns; a reader writes at most 16 levels. */
const deepest = 64;

/** Nested columns: none, or a list of columns for `properties`, or one column for `items`. */
function nestedAreColumns(properties: unknown, items: unknown, depth: number): boolean {
  const listed =
    properties === undefined ||
    (Array.isArray(properties) && properties.every((column) => isColumn(column, depth + 1)));
  return listed && (items === undefined || isColumn(items, depth + 1));
}

/** A column with a name, a logical type and `required`, and its nested columns the same. */
function isColumn(value: unknown, depth = 0): value is SourceColumnDoc {
  if (depth > deepest || !isRecord(value)) return false;
  const { name, logicalType, required, properties, items } = value;
  return (
    typeof name === "string" &&
    typeof logicalType === "string" &&
    typeof required === "boolean" &&
    nestedAreColumns(properties, items, depth)
  );
}

function isTable(value: unknown): value is SourceTableDoc {
  return (
    isRecord(value) &&
    typeof value.object === "string" &&
    isRecord(value.captured) &&
    typeof value.captured.at === "string" &&
    typeof value.captured.from === "string" &&
    typeof value.captured.file === "string" &&
    Array.isArray(value.columns) &&
    value.columns.every((column) => isColumn(column))
  );
}

function namesOf(value: unknown): SourceMetadataDoc["names"] {
  return isRecord(value) &&
    typeof value.parts === "number" &&
    typeof value.caseSensitive === "boolean"
    ? { parts: value.parts, caseSensitive: value.caseSensitive }
    : undefined;
}

/** The text's document when it is a `SourceMetadata` document of the connection, else undefined. */
export function parseMetadata(text: string, connection: string): SourceMetadataDoc | undefined {
  let value: unknown;
  try {
    value = parse(text, { logLevel: "silent" });
  } catch {
    return undefined;
  }
  if (!isRecord(value) || value.kind !== "SourceMetadata" || value.connection !== connection)
    return undefined;
  if (!Array.isArray(value.tables) || !value.tables.every(isTable)) return undefined;
  const names = namesOf(value.names);
  return {
    id: connection,
    connection,
    ...(typeof value.environment === "string" && { environment: value.environment }),
    ...(names && { names }),
    tables: value.tables,
  };
}

/** The column's keys that it has, in order, with their values. */
function fieldsOf(column: SourceColumnDoc): [string, unknown][] {
  return columnKeys.flatMap((key) => (column[key] === undefined ? [] : [[key, column[key]]]));
}

function isFlat(column: SourceColumnDoc): boolean {
  return column.properties === undefined && column.items === undefined;
}

/** A column as an item of a list at `indent`: one line, or a block mapping when it nests. */
function listItem(column: SourceColumnDoc, indent: string): string[] {
  if (isFlat(column)) return [`${indent}- ${flowMapping(fieldsOf(column))}`];
  const [first = "", ...rest] = blockLines(column, `${indent}  `);
  return [`${indent}- ${first.slice(indent.length + 2)}`, ...rest];
}

/** A column with `properties` or `items` as a block mapping at `indent`. */
function blockLines(column: SourceColumnDoc, indent: string): string[] {
  const lines = fieldsOf(column).map(
    ([key, value]) => `${indent}${key}: ${yamlValue(value, "block")}`,
  );
  if (column.properties !== undefined)
    lines.push(...listLines(`${indent}properties:`, column.properties, `${indent}  `));
  const items = column.items;
  if (items !== undefined)
    lines.push(
      ...(isFlat(items)
        ? [`${indent}items: ${flowMapping(fieldsOf(items))}`]
        : [`${indent}items:`, ...blockLines(items, `${indent}  `)]),
    );
  return lines;
}

/** `key:` and the columns as its list, or `key: []` for none. */
function listLines(key: string, columns: SourceColumnDoc[], indent: string): string[] {
  if (columns.length === 0) return [`${key} []`];
  return [key, ...columns.flatMap((column) => listItem(column, indent))];
}

function tableLines(table: SourceTableDoc): string[] {
  const { at, from, recipe, file } = table.captured;
  const captured = flowMapping([
    ["at", at],
    ["from", from],
    ...(recipe === undefined ? [] : ([["recipe", recipe]] as [string, unknown][])),
    ["file", file],
  ]);
  return [
    `  - object: ${yamlText(table.object, "block")}`,
    `    captured: ${captured}`,
    ...listLines("    columns:", table.columns, "      "),
  ];
}

/** The document's text: the header comment, then its keys in order, ending with a line break. */
export function metadataText(document: SourceMetadataDoc): string {
  const { id, connection, environment, names } = document;
  const lines = [
    header,
    "apiVersion: ingestron.io/v1",
    "kind: SourceMetadata",
    `id: ${yamlText(id, "block")}`,
    `connection: ${yamlText(connection, "block")}`,
    ...(environment === undefined ? [] : [`environment: ${yamlText(environment, "block")}`]),
    ...(names === undefined
      ? []
      : [
          `names: ${flowMapping([
            ["parts", names.parts],
            ["caseSensitive", names.caseSensitive],
          ])}`,
        ]),
    ...(document.tables.length === 0 ? ["tables: []"] : ["tables:"]),
    ...document.tables.flatMap(tableLines),
  ];
  return `${lines.join("\n")}\n`;
}
