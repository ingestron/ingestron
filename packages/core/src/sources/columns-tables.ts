// The tables of a columns file: its rows grouped by object, checked, ordered and typed
// (spec/cli/sources.md, section 2.1).
import type { SourceColumnDoc } from "@ingestron/definitions";
import type { ColumnRow } from "./columns-rows.js";
import type { SourceRecipe } from "./recipe.js";
import type { Outcome } from "./result.js";
import { logicalTypeOf, unknownTypeNote } from "./types.js";

/** The rows of each object, in the order the objects first appear. */
function group(rows: ColumnRow[]): Map<string, ColumnRow[]> {
  const tables = new Map<string, ColumnRow[]>();
  for (const row of rows) tables.set(row.object, [...(tables.get(row.object) ?? []), row]);
  return tables;
}

/** The values that appear more than once, each once. */
function repeated<T>(values: T[]): T[] {
  return [...new Set(values.filter((value, at) => values.indexOf(value) !== at))];
}

/** The reasons a table is refused, in the order the specification lists them. */
function problems(
  file: string,
  object: string,
  rows: ColumnRow[],
  recipe?: SourceRecipe,
): string[] {
  const table = `${file}: the table "${object}"`;
  const result = repeated(rows.map((row) => row.column)).map(
    (name) => `${table} lists the column "${name}" twice.`,
  );
  const ordinals = rows.flatMap((row) => (row.ordinal === undefined ? [] : [row.ordinal]));
  if (repeated(ordinals).length > 0)
    result.push(`${table} gives two columns the same ordinal_position.`);
  if (ordinals.length > 0 && ordinals.length < rows.length)
    result.push(`${table} gives ordinal_position to some columns and not others.`);
  const keys = rows.flatMap((row) => (row.keyPosition === undefined ? [] : [row.keyPosition]));
  if (recipe?.key === undefined && repeated(keys).length > 0)
    result.push(`${table} gives two columns the same primary_key_position.`);
  return result;
}

/** The rows in `ordinal_position` order, or the file's order when none has one. */
function ordered(rows: ColumnRow[]): ColumnRow[] {
  return rows.every((row) => row.ordinal !== undefined)
    ? [...rows].sort((a, b) => a.ordinal! - b.ordinal!)
    : rows;
}

/** The column's place in the key: the recipe's `key`, or the file's `primary_key_position`. */
function keyPosition(row: ColumnRow, recipe: SourceRecipe | undefined): number | undefined {
  if (recipe?.key === undefined) return row.keyPosition;
  const at = recipe.key.indexOf(row.column);
  return at < 0 ? undefined : at + 1;
}

function columnOf(
  row: ColumnRow,
  recipe: SourceRecipe | undefined,
  notes: string[],
): SourceColumnDoc {
  const type = logicalTypeOf(row.type, recipe);
  if (type === undefined) notes.push(unknownTypeNote(row.type, row.object, row.column));
  const place = keyPosition(row, recipe);
  return {
    name: row.column,
    ...(row.type !== "" && { sourceType: row.type }),
    logicalType: type?.logicalType ?? "string",
    ...(type?.logicalTypeOptions && { logicalTypeOptions: type.logicalTypeOptions }),
    required: row.required,
    ...(place !== undefined && { primaryKeyPosition: place }),
  };
}

/** The tables of the rows, or the reasons the file is refused. */
export function columnsTables(file: string, rows: ColumnRow[], recipe?: SourceRecipe): Outcome {
  if (rows.length === 0) return { refused: [`${file} lists no columns.`] };
  const grouped = group(rows);
  const refused = [...grouped].flatMap(([object, own]) => problems(file, object, own, recipe));
  if (refused.length > 0) return { refused };
  const notes: string[] = [];
  const tables = [...grouped].map(([object, own]) => ({
    object,
    columns: ordered(own).map((row) => columnOf(row, recipe, notes)),
  }));
  return { tables, notes };
}
