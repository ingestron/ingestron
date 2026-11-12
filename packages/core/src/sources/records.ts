// The records of a CSV or JSON file, as the columns file and samples read them
// (spec/cli/sources.md, sections 2.1 and 2.2).
import { csvRecords } from "../csv.js";
import { typeOf } from "../sample-type.js";

/** A CSV file: its header's names as written, and each record's values. */
export interface CsvTable {
  header: string[];
  rows: string[][];
}

/** `;` when the header line holds `;` and no `,`, else `,`. */
function delimiterOf(text: string): string {
  const line = text.slice(0, text.search(/\r?\n|$/));
  return line.includes(";") && !line.includes(",") ? ";" : ",";
}

/** The header and records of CSV text; a blank line is not a record. `limit` counts records. */
export function csvTable(text: string, limit = Infinity): CsvTable {
  const [header = [], ...rows] = csvRecords(text, delimiterOf(text), limit);
  return { header, rows: rows.filter((row) => row.length > 1 || row[0] !== "") };
}

/**
 * True when a CSV file's first line can be a header: each name is at most 128 characters and is
 * not a number, date or other value of a type. A headerless file has a data row there, which is
 * never shown.
 */
export function looksLikeHeader(names: string[]): boolean {
  return names.every(
    (name) =>
      name.trim().length <= 128 &&
      typeOf([name.trim()]) === "string" &&
      !/^-?\d+$/.test(name.trim()),
  );
}

/** True for a JSON object that is not a list. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The value at a path of keys joined with `.`; the root when there is no path. */
export function valueAt(root: unknown, path: string | undefined): unknown {
  let value = root;
  for (const key of path === undefined ? [] : path.split(".")) {
    if (!isRecord(value)) return undefined;
    value = value[key];
  }
  return value;
}
