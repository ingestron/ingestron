// A column's ODCS logicalTypeOptions as checks of each row: limits on length,
// pattern, range, multiples and array items (specification section 6).
import { isRecord } from "./merge.js";

type Check = (name: string, value: unknown) => string;

/** Each option a row can be held to, as SQL that is true for a valid value. */
const options: Record<string, Check> = {
  minLength: (name, value) => `length(${name}) >= ${literal(value)}`,
  maxLength: (name, value) => `length(${name}) <= ${literal(value)}`,
  pattern: (name, value) => `${name} RLIKE ${literal(value)}`,
  minimum: (name, value) => `${name} >= ${literal(value)}`,
  exclusiveMinimum: (name, value) => `${name} > ${literal(value)}`,
  maximum: (name, value) => `${name} <= ${literal(value)}`,
  exclusiveMaximum: (name, value) => `${name} < ${literal(value)}`,
  multipleOf: (name, value) => `${name} % ${literal(value)} = 0`,
  minItems: (name, value) => `size(${name}) >= ${literal(value)}`,
  maxItems: (name, value) => `size(${name}) <= ${literal(value)}`,
  uniqueItems: (name, value) =>
    value === true ? `size(array_distinct(${name})) = size(${name})` : "",
};

/** The row checks a column's logicalTypeOptions make, in the options' order; a null passes. */
export function optionChecks(column: string, value: unknown): { name: string; check: string }[] {
  if (!isRecord(value)) return [];
  const name = `\`${column}\``;
  return Object.entries(value).flatMap(([option, limit]) => {
    const check = options[option]?.(name, limit);
    if (!check) return [];
    const suffix = option.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    return [{ name: `${column}_${suffix}`.toLowerCase(), check: `${name} IS NULL OR ${check}` }];
  });
}

/** A SQL literal: numbers as they are, text quoted. */
export function literal(value: unknown): string {
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}
