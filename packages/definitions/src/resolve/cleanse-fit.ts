// Whether a value fits a column's type, for `map` and `default` (specification section 6.1).
// A column of a type it does not know, or with none, takes any value.
import type { Column } from "../pack/index.js";

const date = /^\d{4}-\d{2}-\d{2}$/;
const timestamp = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const isDate = (value: unknown) => typeof value === "string" && date.test(value);
const isTimestamp = (value: unknown) => typeof value === "string" && timestamp.test(value);

/** True when the column is text, by its contract's `logicalType`. */
export function isText(column: Column): boolean {
  return column.logicalType === "string";
}

/** True when the column's contract gives a type and it is not text. */
export function isNotText(column: Column): boolean {
  return column.logicalType !== undefined && column.logicalType !== "string";
}

/** True when the column's contract gives a type and it is not a timestamp. */
export function isNotTimestamp(column: Column): boolean {
  return column.logicalType !== undefined && column.logicalType !== "timestamp";
}

/** Whether a value is one the type holds, by the type's `logicalType`. */
const values: Record<string, (value: unknown) => boolean> = {
  string: (value) => typeof value === "string",
  integer: (value) => Number.isInteger(value),
  number: (value) => typeof value === "number" && Number.isFinite(value),
  boolean: (value) => typeof value === "boolean",
  date: isDate,
  timestamp: isTimestamp,
};

/** Whether text reads as a value of the type; a `map` key is always text. */
const keys: Record<string, (key: string) => boolean> = {
  integer: (key) => /^-?\d+$/.test(key),
  number: (key) => key.trim() !== "" && Number.isFinite(Number(key)),
  boolean: (key) => key === "true" || key === "false",
  date: isDate,
  timestamp: isTimestamp,
};

/** True when the value is one the column can hold; null fits a column that is not required. */
export function fitsValue(column: Column, value: unknown): boolean {
  if (value === null) return column.nullable;
  return values[column.logicalType ?? ""]?.(value) ?? true;
}

/** True when a `map` key, which is always text, reads as a value the column can hold. */
export function fitsKey(column: Column, key: string): boolean {
  return keys[column.logicalType ?? ""]?.(key) ?? true;
}
