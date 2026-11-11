// A column's ODCS logicalTypeOptions as checks of each row: limits on length,
// pattern, range, multiples and array items (specification section 6).
import { isRecord } from "../internal/index.js";
import type { RowRule } from "../pack/index.js";

/** The row check an option makes: SQL true for a valid value, and the same as data. */
interface Check {
  sql: string;
  /** Absent when the option's value is not of the type ODCS gives it. */
  rule?: RowRule;
}

type Option = (column: string, value: unknown) => Check;

const isNumber = (value: unknown): value is number => typeof value === "number";
const isLimit = (value: unknown): value is number | string =>
  isNumber(value) || typeof value === "string";

/** An option with one limit, compared with `operator`; `rule` is made from the typed limit. */
function limit(
  sql: (name: string, value: unknown) => string,
  rule: (column: string, value: unknown) => RowRule | undefined,
): Option {
  return (column, value) => {
    const made = rule(column, value);
    return { sql: sql(`\`${column}\``, value), ...(made && { rule: made }) };
  };
}

/** Each option a row can be held to. */
const options: Record<string, Option> = {
  minLength: limit(
    (name, value) => `length(${name}) >= ${literal(value)}`,
    (column, value) => (isNumber(value) ? { kind: "length", column, min: value } : undefined),
  ),
  maxLength: limit(
    (name, value) => `length(${name}) <= ${literal(value)}`,
    (column, value) => (isNumber(value) ? { kind: "length", column, max: value } : undefined),
  ),
  pattern: limit(
    (name, value) => `${name} RLIKE ${literal(value)}`,
    (column, value) =>
      typeof value === "string" ? { kind: "pattern", column, pattern: value } : undefined,
  ),
  minimum: limit(
    (name, value) => `${name} >= ${literal(value)}`,
    (column, value) => (isLimit(value) ? { kind: "range", column, min: value } : undefined),
  ),
  exclusiveMinimum: limit(
    (name, value) => `${name} > ${literal(value)}`,
    (column, value) =>
      isLimit(value) ? { kind: "range", column, min: value, exclusive: true } : undefined,
  ),
  maximum: limit(
    (name, value) => `${name} <= ${literal(value)}`,
    (column, value) => (isLimit(value) ? { kind: "range", column, max: value } : undefined),
  ),
  exclusiveMaximum: limit(
    (name, value) => `${name} < ${literal(value)}`,
    (column, value) =>
      isLimit(value) ? { kind: "range", column, max: value, exclusive: true } : undefined,
  ),
  multipleOf: limit(
    (name, value) => `${name} % ${literal(value)} = 0`,
    (column, value) => (isNumber(value) ? { kind: "multipleOf", column, value } : undefined),
  ),
  minItems: limit(
    (name, value) => `size(${name}) >= ${literal(value)}`,
    (column, value) => (isNumber(value) ? { kind: "items", column, min: value } : undefined),
  ),
  maxItems: limit(
    (name, value) => `size(${name}) <= ${literal(value)}`,
    (column, value) => (isNumber(value) ? { kind: "items", column, max: value } : undefined),
  ),
  uniqueItems: (column, value) => ({
    sql: value === true ? `size(array_distinct(\`${column}\`)) = size(\`${column}\`)` : "",
    rule: { kind: "items", column, unique: true },
  }),
};

/** The row checks a column's logicalTypeOptions make, each with its option, in the options' order; a null passes. */
export function optionChecks(
  column: string,
  value: unknown,
): { option: string; name: string; check: string; rule?: RowRule }[] {
  if (!isRecord(value)) return [];
  const name = `\`${column}\``;
  return Object.entries(value).flatMap(([option, limit]) => {
    const made = options[option]?.(column, limit);
    if (!made?.sql) return [];
    const suffix = option.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    return [
      {
        option,
        name: `${column}_${suffix}`.toLowerCase(),
        check: `${name} IS NULL OR ${made.sql}`,
        ...(made.rule && { rule: made.rule }),
      },
    ];
  });
}

/** A SQL literal: numbers as they are, text quoted. */
export function literal(value: unknown): string {
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}
