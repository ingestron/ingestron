// Rows of a sample file: CSV (comma, semicolon or tab, with quotes) or JSON
// (an array of objects, or one object per line). At most `limit` rows.
import { csvRecords } from "../csv.js";

/** The column names in order, and each row's values by name. */
export interface Sample {
  columns: string[];
  rows: Record<string, unknown>[];
}

/** Reads `text` as CSV, or as JSON when the file name ends in .json, .jsonl or .ndjson. */
export function readSample(text: string, file: string, limit = 1000): Sample {
  return /\.(json|jsonl|ndjson)$/i.test(file) ? jsonSample(text, limit) : csvSample(text, limit);
}

function jsonSample(text: string, limit: number): Sample {
  const trimmed = text.trim();
  const items: unknown[] = trimmed.startsWith("[")
    ? (JSON.parse(trimmed) as unknown[])
    : trimmed
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(0, limit)
        .map((line) => JSON.parse(line) as unknown);
  const rows = items
    .slice(0, limit)
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return { columns, rows };
}

function csvSample(text: string, limit: number): Sample {
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const delimiter = [",", ";", "\t"].reduce((best, candidate) =>
    firstLine.split(candidate).length > firstLine.split(best).length ? candidate : best,
  );
  const [header = [], ...records] = csvRecords(text, delimiter, limit + 1);
  const rows = records
    .filter((record) => record.some((value) => value !== ""))
    .map((record) => Object.fromEntries(header.map((name, index) => [name, record[index] ?? ""])));
  return { columns: header, rows };
}
