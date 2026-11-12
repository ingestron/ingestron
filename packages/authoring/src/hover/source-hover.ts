// The hover on a flow table without a contract: the columns its connection's source metadata
// lists for it, with their source types and key, and where they were captured from. Names, types
// and dates only: no document holds a value from a source's rows.
import type { SourceColumnDoc, SourceTableDoc } from "@ingestron/definitions";
import { parse } from "yaml";
import { kindOf } from "../navigation/index.js";
import { resolved, spotAt, type Project, type Spot } from "../project/index.js";

/**
 * The source columns of the flow table whose key or `object` is at `offset`, as Markdown, when
 * the table names no contract and its metadata has an entry; undefined for anything else.
 */
export function sourceColumnsText(
  project: Project,
  text: string,
  offset: number,
  environment: string | undefined,
): string | undefined {
  const spot = safeSpot(text, offset);
  const table = spot && tableNamed(text, spot);
  const flow = table && flowIdOf(text);
  if (!table || !flow) return undefined;
  const found = resolved(project, environment).sourceTables?.find(
    (item) => item.flow === flow && item.table === table,
  );
  return found?.contract === undefined && found?.entry ? entryText(found.entry) : undefined;
}

function safeSpot(text: string, offset: number): Spot | undefined {
  try {
    return spotAt(text, offset);
  } catch {
    return undefined;
  }
}

/** The key of the table whose key, or whose `object` value, the spot is. */
function tableNamed(text: string, spot: Spot): string | undefined {
  if (kindOf(text) !== "Flow") return undefined;
  const [root, name, field] = spot.segments;
  if (root !== "tables" || name === undefined) return undefined;
  if (spot.part === "key" && spot.segments.length === 2) return name;
  return spot.part === "value" && spot.segments.length === 3 && field === "object"
    ? name
    : undefined;
}

function flowIdOf(text: string): string | undefined {
  try {
    const id = (parse(text) as { id?: unknown } | null)?.id;
    return typeof id === "string" ? id : undefined;
  } catch {
    return undefined;
  }
}

function entryText({ object, captured, columns }: SourceTableDoc): string {
  return [
    `Columns of \`${object}\` in the source metadata:`,
    "",
    ...columns.flatMap((column) => columnLines(column, "")),
    "",
    `Captured ${captured.at.slice(0, 10)} from ${captured.from} (${captured.file}).`,
  ].join("\n");
}

/** A column as a list item, the key marked, then the columns inside it one level in. */
function columnLines(column: SourceColumnDoc, indent: string): string[] {
  const type = column.sourceType ?? column.logicalType;
  const key = column.primaryKeyPosition === undefined ? "" : ", key";
  return [
    `${indent}- \`${column.name}\`: ${type}${key}`,
    ...(column.properties ?? []).flatMap((inner) => columnLines(inner, `${indent}  `)),
  ];
}
