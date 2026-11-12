// The Salesforce describe reader (spec/cli/sources.md, section 2.4): the JSON an object's
// `describe` returns. The table is the describe's `name`, each field a column.
import type { SourceColumnDoc } from "@ingestron/definitions";
import { isRecord, jsonOf } from "./records.js";
import type { SourceRecipe } from "./recipe.js";
import type { Outcome, Reader, ReaderInput } from "./result.js";
import { logicalTypeOf, unknownTypeNote } from "./types.js";

type Data = Record<string, unknown>;

function describeOf(input: ReaderInput): { value: Data } | { refused: string[] } | undefined {
  const parsed = jsonOf(input);
  if (parsed === undefined) return undefined;
  if ("refused" in parsed) return parsed;
  const { value } = parsed;
  return isRecord(value) && typeof value.name === "string" && Array.isArray(value.fields)
    ? { value }
    : undefined;
}

/** A number above zero, or undefined. */
function positive(value: unknown): number | undefined {
  return typeof value === "number" && value > 0 ? value : undefined;
}

/**
 * The options a string or a number gets from the field: its `length` as `maxLength`, or its
 * `precision` and `scale`. An option the recipe's rule already gave is kept.
 */
function fieldOptions(field: Data, logicalType: string): Record<string, unknown> {
  const length = positive(field.length);
  const precision = positive(field.precision);
  if (logicalType === "string" && length !== undefined) return { maxLength: length };
  if (logicalType !== "number" || precision === undefined) return {};
  return { precision, scale: typeof field.scale === "number" ? field.scale : 0 };
}

/** The column a field is: typed through the recipe, else the generic map, else string with a note. */
function columnOf(
  field: Data & { name: string },
  object: string,
  recipe: SourceRecipe | undefined,
  notes: string[],
): SourceColumnDoc {
  const sourceType = typeof field.type === "string" ? field.type : undefined;
  const known = sourceType === undefined ? undefined : logicalTypeOf(sourceType, recipe);
  if (sourceType !== undefined && known === undefined)
    notes.push(unknownTypeNote(sourceType, object, field.name));
  const logicalType = known?.logicalType ?? "string";
  const options = { ...fieldOptions(field, logicalType), ...known?.logicalTypeOptions };
  return {
    name: field.name,
    ...(sourceType !== undefined && { sourceType }),
    logicalType,
    ...(Object.keys(options).length > 0 && { logicalTypeOptions: options }),
    required: field.nillable === false,
  };
}

/** Reads the describe's fields as the columns of its table. */
function read(input: ReaderInput): Outcome {
  const describe = describeOf(input);
  if (describe === undefined)
    return {
      refused: [`${input.file} is not a Salesforce describe: it has no name and fields.`],
    };
  if ("refused" in describe) return describe;
  const object = describe.value.name as string;
  const notes: string[] = [];
  const fields = (describe.value.fields as unknown[])
    .filter(isRecord)
    .filter(
      (field): field is Data & { name: string } =>
        typeof field.name === "string" && field.name !== "",
    );
  if (fields.length === 0) return { refused: [`${input.file} describes no fields.`] };
  const columns = fields.map((field) => columnOf(field, object, input.recipe, notes));
  const key = fields.findIndex((field) => field.type === "id");
  if (key >= 0) columns[key]!.primaryKeyPosition = 1;
  return { tables: [{ object, columns }], notes };
}

/** True for a JSON mapping with a `name` and a list of `fields`. */
function accepts(input: ReaderInput): boolean {
  const describe = describeOf(input);
  return describe !== undefined && "value" in describe;
}

/** The Salesforce describe reader. */
export const salesforceReader: Reader = { accepts, read };
