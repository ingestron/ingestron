// Checks in words, for the passport's section 5 (spec/cli/passport.md).
import type { RowRule, TableCheck } from "@ingestron/definitions";
import { code } from "./passport-sections.js";

/** Each rule kind in words, the column already in code. */
const ruleText: {
  [Kind in RowRule["kind"]]: (rule: Extract<RowRule, { kind: Kind }>, column: string) => string;
} = {
  notNull: (_rule, column) => `${column} has a value`,
  in: (rule, column) => listedWords(rule, column, "is"),
  notIn: (rule, column) => listedWords(rule, column, "is not"),
  pattern: (rule, column) => `${column} matches ${code(rule.pattern)}`,
  length: (rule, column) =>
    `${column} has ${between(rule.min, rule.max)} ${plural(rule.max ?? rule.min, "character")}`,
  range: (rule, column) =>
    `${column} is ${rangeWords(rule.min, rule.max, rule.exclusive === true)}`,
  multipleOf: (rule, column) => `${column} is a multiple of ${rule.value}`,
  items: (rule, column) => {
    const count =
      rule.min === undefined && rule.max === undefined
        ? undefined
        : `has ${between(rule.min, rule.max)} ${plural(rule.max ?? rule.min, "item")}`;
    if (!rule.unique) return `${column} ${count}`;
    const unique = "items that are all different";
    return count ? `${column} ${count}, with ${unique}` : `${column} has ${unique}`;
  },
};

/** A row rule in words, such as: `email` has a value. */
export function ruleWords(rule: RowRule): string {
  const words = ruleText[rule.kind] as (rule: RowRule, column: string) => string;
  return words(rule, `\`${rule.column}\``);
}

/** An `in` or `notIn` rule in words: one of its values, and whether no value passes. */
function listedWords(
  rule: Extract<RowRule, { kind: "in" | "notIn" }>,
  column: string,
  verb: "is" | "is not",
): string {
  const one = `${verb} ${rule.values.length === 1 ? "" : "one of "}${listOf(rule.values)}`;
  return rule.allowNull ? `${column} ${one}, or has no value` : `${column} has a value and ${one}`;
}

/** The noun for a count: one item, two items. */
function plural(count: number | undefined, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}

function between(min: number | undefined, max: number | undefined): string {
  if (min !== undefined && max !== undefined) return `${min} to ${max}`;
  return min !== undefined ? `at least ${min}` : `at most ${max}`;
}

function rangeWords(
  min: number | string | undefined,
  max: number | string | undefined,
  exclusive: boolean,
): string {
  if (min !== undefined && max !== undefined)
    return exclusive
      ? `between ${valueText(min)} and ${valueText(max)}, not either`
      : `from ${valueText(min)} to ${valueText(max)}`;
  if (min !== undefined) return `${exclusive ? "more than" : "at least"} ${valueText(min)}`;
  return `${exclusive ? "less than" : "at most"} ${valueText(max)}`;
}

/** A value as the passport writes it: text as code, anything else as it is. */
export function valueText(value: unknown): string {
  return typeof value === "string" ? code(value) : String(value);
}

function listOf(values: unknown[]): string {
  const shown = values.map(valueText);
  return shown.length <= 1
    ? (shown[0] ?? "nothing")
    : `${shown.slice(0, -1).join(", ")} or ${shown.at(-1)}`;
}

const counted: Record<TableCheck["metric"], (columns: string) => string> = {
  rowCount: () => "the number of rows",
  nullValues: (columns) => `the rows where ${columns} has no value`,
  missingValues: (columns) => `the rows where ${columns} is missing`,
  invalidValues: (columns) => `the rows where ${columns} is not valid`,
  duplicateValues: (columns) =>
    columns ? `the duplicate values of ${columns}` : "the duplicate rows",
  sql: () => "what its query returns",
};

const compared: Record<TableCheck["operator"], string> = {
  mustBe: "is",
  mustNotBe: "is not",
  mustBeGreaterThan: "is more than",
  mustBeGreaterOrEqualTo: "is at least",
  mustBeLessThan: "is less than",
  mustBeLessOrEqualTo: "is at most",
  mustBeBetween: "is between",
  mustNotBeBetween: "is not between",
};

/** A table check in words: what it counts and how the count is compared. */
export function tableCheckWords(check: TableCheck): string {
  const columns = check.columns.map((column) => `\`${column}\``).join(" and ");
  const what = counted[check.metric](columns);
  const share = check.unit === "percent" ? ", as a percentage of all rows," : "";
  const value = Array.isArray(check.value)
    ? check.value.map(valueText).join(" and ")
    : valueText(check.value);
  return `${what}${share} ${compared[check.operator]} ${value}`;
}
