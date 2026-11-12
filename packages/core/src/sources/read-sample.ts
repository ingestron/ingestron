// The sample reader (spec/cli/sources.md, section 2.2): CSV, JSON, JSON lines and Parquet. A sample
// describes one table, whose object the import gives.
import type { SourceColumnDoc } from "@ingestron/definitions";
import { readParquet } from "./read-parquet.js";
import { csvTable, isRecord, looksLikeHeader, valueAt } from "./records.js";
import type { Outcome, Reader, ReaderInput, Refused } from "./result.js";
import { inferColumns } from "./sample-columns.js";
import { extensionOf, parseJson } from "./text.js";

const extensions = [".csv", ".json", ".jsonl", ".ndjson", ".parquet"];

function holdsNoRecords(file: string): Refused {
  return {
    refused: [`${file} holds no records: a JSON sample is a list of records, or one record.`],
  };
}

function csvRecords(input: ReaderInput): Record<string, unknown>[] | Refused {
  const { header, rows } = csvTable(input.text);
  if (header.length === 0) return { refused: [`${input.file} has no columns.`] };
  if (!looksLikeHeader(header))
    return {
      refused: [`${input.file} has no header row: its first line is not a list of column names.`],
    };
  const names = header.map((name) => name.trim());
  return rows.map((row) =>
    Object.fromEntries(
      names.map((name, at) => [name, row[at] ?? ""]).filter(([name]) => name !== ""),
    ),
  );
}

function jsonRecords(input: ReaderInput): Record<string, unknown>[] | Refused {
  const parsed = parseJson(input.text, input.file);
  if ("refused" in parsed) return parsed;
  const value = valueAt(parsed.value, input.recipe?.rows);
  const list = Array.isArray(value) ? value : [value];
  return list.every(isRecord) ? list : holdsNoRecords(input.file);
}

function linesRecords(input: ReaderInput): Record<string, unknown>[] | Refused {
  const records: Record<string, unknown>[] = [];
  for (const [at, line] of input.text.split(/\r?\n/).entries()) {
    if (line.trim() === "") continue;
    const parsed = parseJson(line, input.file, at);
    if ("refused" in parsed) return parsed;
    if (!isRecord(parsed.value)) return holdsNoRecords(input.file);
    records.push(parsed.value);
  }
  return records;
}

function recordsOf(input: ReaderInput): Record<string, unknown>[] | Refused {
  const extension = extensionOf(input.file);
  if (extension === ".csv") return csvRecords(input);
  return extension === ".json" ? jsonRecords(input) : linesRecords(input);
}

function columnsOf(input: ReaderInput): SourceColumnDoc[] | Refused {
  if (extensionOf(input.file) === ".parquet") return readParquet(input);
  const records = recordsOf(input);
  if ("refused" in records) return records;
  const columns = inferColumns(records);
  return columns.length === 0 ? { refused: [`${input.file} has no columns.`] } : columns;
}

/** Reads the sample's columns as the table the import names. */
function read(input: ReaderInput): Outcome {
  if (input.object === undefined)
    return { refused: ["Name the table this file describes with --object."] };
  const columns = columnsOf(input);
  if ("refused" in columns) return columns;
  return { tables: [{ object: input.object, columns }], notes: [] };
}

/** The sample reader. */
export const sampleReader: Reader = {
  accepts: (input) => extensions.includes(extensionOf(input.file)),
  read,
};
