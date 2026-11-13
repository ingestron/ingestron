// The sample reader (spec/cli/sources.md, section 2.2): CSV, JSON, JSON lines and Parquet. A sample
// describes one table, whose object the import gives.
import type { SourceColumnDoc } from "@ingestron/definitions";
import { keepingOrder } from "./key-order.js";
import { readParquet } from "./read-parquet.js";
import { csvTable, isRecord, holdsNoName, valueAt } from "./records.js";
import type { Outcome, Reader, ReaderInput, Refused } from "./result.js";
import { inferColumns } from "./sample-columns.js";
import { extensionOf, parseJson } from "./text.js";

const extensions = [".csv", ".json", ".jsonl", ".ndjson", ".parquet"];

function holdsNoRecords(file: string): Refused {
  return {
    refused: [`${file} holds no records: a JSON sample is a list of records, or one record.`],
  };
}

/** A sample's records, and the names in the order the file gives them when it does. */
interface Records {
  records: Record<string, unknown>[];
  names?: string[];
}

/** What a refusal says of a first line that has no name: how many fields, and how many have text. */
function describeFirstLine(header: string[]): string {
  const empty = header.filter((cell) => cell.trim() === "").length;
  if (header.length === 1)
    return `the first line has 1 field, which is ${empty === 1 ? "empty" : "a number or a date"}`;
  return `the first line has ${header.length} fields, ${header.length - empty} of them numbers or dates`;
}

function csvRecords(input: ReaderInput): Records | Refused {
  const { header, rows } = csvTable(input.text);
  if (header.length === 0) return { refused: [`${input.file} has no columns.`] };
  if (holdsNoName(header))
    return { refused: [`${input.file} has no header row: ${describeFirstLine(header)}.`] };
  const names = header.map((name) => name.trim());
  const records = rows.map((row) =>
    Object.fromEntries(
      names.map((name, at) => [name, row[at] ?? ""]).filter(([name]) => name !== ""),
    ),
  );
  return { records, names: [...new Set(names.filter((name) => name !== ""))] };
}

function jsonRecords(input: ReaderInput): Records | Refused {
  const parsed = input.json();
  if ("refused" in parsed) return parsed;
  const value = valueAt(keepingOrder(input.text, parsed.value), input.recipe?.rows);
  const list = Array.isArray(value) ? value : [value];
  return list.every(isRecord) ? { records: list } : holdsNoRecords(input.file);
}

function linesRecords(input: ReaderInput): Records | Refused {
  const records: Record<string, unknown>[] = [];
  for (const [at, line] of input.text.split(/\r?\n/).entries()) {
    if (line.trim() === "") continue;
    const parsed = parseJson(line, input.file, at);
    if ("refused" in parsed) return parsed;
    const value = keepingOrder(line, parsed.value);
    if (!isRecord(value)) return holdsNoRecords(input.file);
    records.push(value);
  }
  return { records };
}

function recordsOf(input: ReaderInput): Records | Refused {
  const extension = extensionOf(input.file);
  if (extension === ".csv") return csvRecords(input);
  return extension === ".json" ? jsonRecords(input) : linesRecords(input);
}

function columnsOf(input: ReaderInput): SourceColumnDoc[] | Refused {
  if (extensionOf(input.file) === ".parquet") return readParquet(input);
  const records = recordsOf(input);
  if ("refused" in records) return records;
  const columns = inferColumns(records.records, records.names);
  return columns.length === 0 ? { refused: [`${input.file} has no columns.`] } : columns;
}

/** Reads the sample's columns as the table the import names. */
function read(input: ReaderInput): Outcome {
  // The editor's importSource (packages/authoring) matches this text exactly to ask for the
  // table: change both together.
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
