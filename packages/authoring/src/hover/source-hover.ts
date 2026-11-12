// The hover on a flow table without a contract: the columns its connection's source metadata
// lists for it, with their source types and key, and where they were captured from. Names, types
// and dates only: no document holds a value from a source's rows, and no environment variable's
// value decides what is shown.
import type { SourceColumnDoc, SourceTableDoc } from "@ingestron/definitions";
import { parse } from "yaml";
import { kindOf } from "../navigation/index.js";
import { resolvedForDisplay, spotAt, type Project, type Spot } from "../project/index.js";

/** The most columns a hover lists; the rest are counted. */
const shownColumns = 50;

/**
 * The source columns of the flow table whose key or `object` is at `offset`, as Markdown, when
 * the table names no contract and its metadata has an entry; undefined for anything else. The
 * project is resolved as shown, without the host's environment or `.env` files, and an object
 * that still holds a reference then (one to an environment variable) gives none: which entry it
 * would match depends on a value that is not shown.
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
  const found = resolvedForDisplay(project, environment).sourceTables?.find(
    (item) => item.flow === flow && item.table === table,
  );
  if (!found?.entry || found.contract !== undefined || found.object.includes("${"))
    return undefined;
  return entryText(found.entry);
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
  const lines = columns.flatMap((column) => columnLines(column, ""));
  const hidden = lines.length - shownColumns;
  return [
    `Columns of ${code(object)} in the source metadata:`,
    "",
    ...(hidden > 0 ? [...lines.slice(0, shownColumns), `- and ${hidden} more`] : lines),
    "",
    `Captured ${plain(captured.at.slice(0, 10))} from ${plain(captured.from)} (${plain(captured.file)}).`,
  ].join("\n");
}

/**
 * A column as a list item, the key marked, then the columns inside it one level in: its
 * `properties`, or its `items` for an array.
 */
function columnLines(column: SourceColumnDoc, indent: string): string[] {
  const type = column.sourceType ?? column.logicalType;
  const key = column.primaryKeyPosition === undefined ? "" : ", key";
  const inner = [...(column.properties ?? []), ...(column.items ? [column.items] : [])];
  return [
    `${indent}- ${code(column.name)}: ${plain(type)}${key}`,
    ...inner.flatMap((item) => columnLines(item, `${indent}  `)),
  ];
}

/** Each line break written out as `\n`, `\r` or `\u2028`, so that a name stays on its item's line. */
const oneLine = (text: string): string =>
  text.replace(/[\r\n\u2028\u2029]/g, (found) =>
    found === "\n" ? "\\n" : found === "\r" ? "\\r" : `\\u${found.charCodeAt(0).toString(16)}`,
  );

/**
 * Text as a Markdown code span: fenced with one backtick more than the longest run it holds, and
 * padded with a space when it starts or ends with one, so that no name ends the span early.
 */
function code(text: string): string {
  const line = oneLine(text);
  const longest = Math.max(0, ...(line.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  const pad = line.startsWith("`") || line.endsWith("`") ? " " : "";
  return `${fence}${pad}${line}${pad}${fence}`;
}

/** Text with the characters Markdown would read as formatting or HTML escaped. */
function plain(text: string): string {
  return oneLine(text).replace(/[\\`*_[\]<>|~#]/g, (found) => `\\${found}`);
}
