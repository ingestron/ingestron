// The records of a CSV or JSON file, as the columns file and samples read them
// (spec/cli/sources.md, sections 2.1 and 2.2).
import { csvRecords } from "../csv.js";
import { typeOf } from "../sample-type.js";
import type { ReaderInput } from "./result.js";
import { extensionOf, type ParseResult } from "./text.js";

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
 * True when no cell of a CSV file's first line could be a name: each is empty or a number (an
 * integer with leading zeros too), a date, a timestamp or a boolean. A headerless file of such
 * values has a data row there, which a refusal never quotes.
 */
export function holdsNoName(cells: string[]): boolean {
  return cells.every((cell) => {
    const text = cell.trim();
    return text === "" || typeOf([text]) !== "string" || /^-?\d+$/.test(text);
  });
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

/** The parsed JSON of a file named `.json` or `.avsc`, or undefined for any other file. */
export function jsonOf(input: ReaderInput): ParseResult | undefined {
  const extension = extensionOf(input.file);
  return extension === ".json" || extension === ".avsc" ? input.json() : undefined;
}

/** The parsed JSON or YAML of a file, by its extension, or undefined for any other file. */
export function documentOf(input: ReaderInput): ParseResult | undefined {
  const extension = extensionOf(input.file);
  return extension === ".yaml" || extension === ".yml" ? input.yaml() : jsonOf(input);
}
