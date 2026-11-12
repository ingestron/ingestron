// The columns reader (spec/cli/sources.md, section 2.1): a CSV or JSON table with one row for
// each column of each table.
import { RowReader, normal, sourceOf, type ColumnRow } from "./columns-rows.js";
import { columnsTables } from "./columns-tables.js";
import { csvTable, isRecord, looksLikeHeader, valueAt } from "./records.js";
import { columnsFields, type SourceRecipe } from "./recipe.js";
import type { Outcome, ReaderInput, Reader, Refused } from "./result.js";
import { extensionOf, parseJson } from "./text.js";

const eight = columnsFields.join(", ");
const required = ["table_name", "column_name", "data_type"] as const;

/** True when the keys are exactly the eight fields, each once, compared without case. */
function isColumnsFile(keys: string[]): boolean {
  const names = keys.map(normal);
  return names.length === columnsFields.length && columnsFields.every((f) => names.includes(f));
}

/** True when the keys hold the fields a recipe's mapping reads `table_name`, `column_name` and `data_type` from. */
function holdsMapped(keys: string[], recipe: SourceRecipe): boolean {
  const names = keys.map(normal);
  return required.every((field) => names.includes(normal(sourceOf(field, recipe)?.key ?? "")));
}

function matches(keys: string[], recipe: SourceRecipe | undefined): boolean {
  return recipe?.fields === undefined ? isColumnsFile(keys) : holdsMapped(keys, recipe);
}

/** The reasons the file's fields are not the ones to read (the first list of keys that breaks the rule). */
function fieldProblems(file: string, keyLists: string[][], recipe?: SourceRecipe): string[] {
  if (recipe?.fields === undefined) {
    const found = keyLists.find((keys) => !isColumnsFile(keys));
    return found === undefined
      ? []
      : [`${file} has the fields ${found.join(", ")}; a columns file has exactly: ${eight}.`];
  }
  const present = new Set(keyLists.flat().map(normal));
  return columnsFields.flatMap((field) => {
    const key = sourceOf(field, recipe)?.key;
    return key === undefined || present.has(normal(key))
      ? []
      : [`${file} has no field "${key}", which the recipe "${recipe.id}" reads as ${field}.`];
  });
}

function rowsOfCsv(input: ReaderInput): Record<string, unknown>[] | Refused {
  const { header, rows } = csvTable(input.text);
  if (header.length === 0) return { refused: [`${input.file} lists no columns.`] };
  if (!looksLikeHeader(header))
    return {
      refused: [
        `${input.file} has no header row: its first line is not a list of field names; a columns file has exactly: ${eight}.`,
      ],
    };
  const problems = fieldProblems(input.file, [header], input.recipe);
  if (problems.length > 0) return { refused: problems };
  return rows.map((row) =>
    Object.fromEntries(header.map((name, at) => [normal(name), row[at] ?? ""])),
  );
}

function rowsOfJson(input: ReaderInput): Record<string, unknown>[] | Refused {
  const parsed = parseJson(input.text, input.file);
  if ("refused" in parsed) return parsed;
  const list = valueAt(parsed.value, input.recipe?.rows);
  if (!Array.isArray(list) || !list.every(isRecord))
    return {
      refused: [`${input.file} holds no records: a JSON columns file is a list of records.`],
    };
  const problems = fieldProblems(
    input.file,
    list.map((record) => Object.keys(record)),
    input.recipe,
  );
  if (problems.length > 0) return { refused: problems };
  return list.map((record) =>
    Object.fromEntries(Object.entries(record).map(([key, value]) => [normal(key), value])),
  );
}

/** Reads the file as a columns file, or says why it cannot. */
function read(input: ReaderInput): Outcome {
  const records = extensionOf(input.file) === ".json" ? rowsOfJson(input) : rowsOfCsv(input);
  if ("refused" in records) return records;
  const reader = new RowReader(input.file, input.recipe);
  const rows: ColumnRow[] = [];
  for (const [at, record] of records.entries()) {
    const row = reader.read(record, at + 1);
    if (typeof row === "string") return { refused: [row] };
    if (row !== null) rows.push(row);
  }
  return columnsTables(input.file, rows, input.recipe);
}

/** True when the file is CSV or JSON whose fields are a columns file's. */
function accepts(input: ReaderInput): boolean {
  const extension = extensionOf(input.file);
  if (extension === ".csv") {
    const { header } = csvTable(input.text, 1);
    return looksLikeHeader(header) && matches(header, input.recipe);
  }
  if (extension !== ".json") return false;
  const parsed = parseJson(input.text, input.file);
  if ("refused" in parsed) return false;
  const first = (valueAt(parsed.value, input.recipe?.rows) as unknown[] | undefined)?.[0];
  return isRecord(first) && matches(Object.keys(first), input.recipe);
}

/** The columns reader. */
export const columnsReader: Reader = { accepts, read };
