// One record of a columns file, read into a column's facts (spec/cli/sources.md, section 2.1).
import type { SourceColumnsField, SourceRecipe } from "./recipe.js";

/** What one record says about one column. */
export interface ColumnRow {
  object: string;
  column: string;
  type: string;
  ordinal?: number;
  keyPosition?: number;
  required: boolean;
}

/** The text of a value; a list or a record is never shown, so it reads as empty. */
export function textOf(value: unknown): string {
  if (typeof value === "string") return value.trim();
  return typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}

/** A field's name compared without case and without the spaces around it. */
export function normal(name: string): string {
  return name.trim().toLowerCase();
}

/** The result's field that holds a columns field, and whether it is read the other way round. */
export function sourceOf(
  field: SourceColumnsField,
  recipe: SourceRecipe | undefined,
): { key: string; negate: boolean } | undefined {
  const mapping = recipe?.fields;
  if (mapping === undefined) return { key: field, negate: false };
  const name = mapping[field];
  if (name === undefined) return undefined;
  return name.startsWith("!") ? { key: name.slice(1), negate: true } : { key: name, negate: false };
}

const yes = new Set(["yes", "y", "true", "1"]);
const no = new Set(["no", "n", "false", "0"]);

/** True for a column that can be null, false for one that cannot, undefined for any other value. */
function canBeNull(value: string): boolean | undefined {
  const word = value.toLowerCase();
  return yes.has(word) ? true : no.has(word) ? false : undefined;
}

/** A whole number from 1, or undefined when the value is empty; NaN when it is anything else. */
function position(value: string): number | undefined {
  if (value === "") return undefined;
  return /^[1-9]\d*$/.test(value) ? Number(value) : Number.NaN;
}

/** Reads the records of a file; `n` counts the file's records from 1, the header not counted. */
export class RowReader {
  constructor(
    private readonly file: string,
    private readonly recipe: SourceRecipe | undefined,
  ) {}

  /** The record as a row, null to skip it, or the reason to refuse the file. */
  read(record: Record<string, unknown>, n: number): ColumnRow | null | string {
    const column = this.text(record, "column_name");
    if (column === "") return null;
    const table = this.text(record, "table_name");
    const type = this.text(record, "data_type");
    const required = this.required(record);
    const ordinal = this.position(record, "ordinal_position");
    const keyPosition =
      this.recipe?.key === undefined ? this.position(record, "primary_key_position") : undefined;
    const bad = [
      table === "" ? "table_name is empty." : undefined,
      type === "" ? "data_type is empty." : undefined,
      required,
      ordinal,
      keyPosition,
    ].find((value) => typeof value === "string");
    if (bad !== undefined) return `${this.file}, row ${n}: ${bad as string}`;
    return {
      object: ["table_catalog", "table_schema", "table_name"]
        .map((field) => this.text(record, field as SourceColumnsField))
        .filter((part) => part !== "")
        .join("."),
      column,
      type,
      ...(typeof ordinal === "number" && { ordinal }),
      ...(typeof keyPosition === "number" && { keyPosition }),
      required: required === true,
    };
  }

  private text(record: Record<string, unknown>, field: SourceColumnsField): string {
    const source = sourceOf(field, this.recipe);
    return source === undefined ? "" : textOf(record[normal(source.key)]);
  }

  /** True when the column cannot be null; a reason as text when the value is not understood. */
  private required(record: Record<string, unknown>): boolean | string {
    const source = sourceOf("is_nullable", this.recipe);
    if (source === undefined) return false;
    const nullable = canBeNull(textOf(record[normal(source.key)]));
    if (nullable === undefined) return "is_nullable is not YES or NO.";
    return source.negate ? nullable : !nullable;
  }

  private position(
    record: Record<string, unknown>,
    field: SourceColumnsField,
  ): number | string | undefined {
    const value = position(this.text(record, field));
    return Number.isNaN(value) ? `${field} is not a whole number from 1.` : value;
  }
}
