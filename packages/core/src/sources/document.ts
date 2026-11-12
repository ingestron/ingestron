// A connection's metadata document as text: read back for an import, and written so a new
// import shows as a small diff (spec/cli/sources.md, section 3, "The document").
import type { SourceColumnDoc, SourceMetadataDoc, SourceTableDoc } from "@ingestron/definitions";
import { parse } from "yaml";
import { metadataOf } from "./metadata-shape.js";
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

/** A document as it is read back and written: the shape of the definitions, and its description. */
export type MetadataDocument = SourceMetadataDoc & { description?: string };

/**
 * The text's document when it is a `SourceMetadata` document of the connection (its `apiVersion`,
 * `kind`, `connection`, `names`, tables and columns as source-metadata.schema.yaml says), else
 * undefined. Its description is kept.
 */
export function parseMetadata(text: string, connection: string): MetadataDocument | undefined {
  let value: unknown;
  try {
    value = parse(text, { logLevel: "silent" });
  } catch {
    return undefined;
  }
  const document = metadataOf(value, connection);
  if (document === undefined) return undefined;
  const { description, environment } = value as { description?: string; environment?: string };
  return {
    ...document,
    ...(description !== undefined && { description }),
    ...(environment !== undefined && { environment }),
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
export function metadataText(document: MetadataDocument): string {
  const { id, connection, description, environment, names } = document;
  const lines = [
    header,
    "apiVersion: ingestron.io/v1",
    "kind: SourceMetadata",
    `id: ${yamlText(id, "block")}`,
    ...(description === undefined ? [] : [`description: ${yamlText(description, "block")}`]),
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
