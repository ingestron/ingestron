// A contract's ODCS quality rules: those that hold for every row become
// checks a row can be held to; the rest compare counts over all rows, which a
// check of one row cannot, and are warnings (specification section 6).
import type { Context } from "./context.js";
import type { Source } from "./diagnostics.js";
import { isOn } from "./capabilities.js";
import { isRecord } from "./merge.js";
import { tableCheckOf, type TableCheck } from "./table-checks.js";
import { literal, optionChecks } from "./type-options.js";

/** A check made from a contract rule, before its action is chosen. */
export interface RuleCheck {
  name: string;
  check: string;
}

type Rule = Record<string, unknown>;

/** A contract object's rules: checks of each row, and checks over all rows. */
export interface ObjectChecks {
  rows: RuleCheck[];
  table: TableCheck[];
}

type Entry = {
  name: string;
  quality?: unknown;
  properties?: {
    name: string;
    quality?: unknown;
    unique?: boolean;
    logicalTypeOptions?: unknown;
  }[];
};

/** The checks of one contract object's rules; warns at each rule it does not check. */
export function ruleChecks(context: Context, entry: Entry, at: Source): ObjectChecks {
  const names = new Set<string>();
  const found: ObjectChecks = { rows: [], table: [] };
  const action = tableAction(context);
  rulesOf(entry.quality).forEach((rule, index) => {
    const name = unique(names, nameOf(entry.name, rule));
    const where = { ...at, pointer: `${at.pointer}/quality/${index}` };
    overTable(context, found, tableCheckOf(rule, name, undefined, action), rule, where);
  });
  (entry.properties ?? []).forEach((property, column) => {
    for (const check of optionChecks(property.name, property.logicalTypeOptions))
      found.rows.push({ ...check, name: unique(names, check.name) });
    rulesOf(property.quality).forEach((rule, index) => {
      const name = unique(names, nameOf(property.name, rule));
      const where = { ...at, pointer: `${at.pointer}/properties/${column}/quality/${index}` };
      const check = rowCheck(property.name, rule);
      if (check) found.rows.push({ name, check });
      else overTable(context, found, tableCheckOf(rule, name, property.name, action), rule, where);
    });
    if (property.unique === true && isOn(context, "checks"))
      found.table.push(
        uniqueCheck(unique(names, `${property.name}_unique`), property.name, action),
      );
  });
  return found;
}

/** A table check runs when checks are on; otherwise, or when it cannot be one, the rule warns. */
function overTable(
  context: Context,
  found: ObjectChecks,
  check: TableCheck | undefined,
  rule: Rule,
  at: Source,
): void {
  if (check && isOn(context, "checks")) found.table.push(check);
  else notChecked(context, rule, at, check !== undefined);
}

function uniqueCheck(name: string, column: string, action: TableCheck["action"]): TableCheck {
  const base = { name, metric: "duplicateValues" as const, columns: [column], arguments: {} };
  return { ...base, operator: "mustBe", value: 0, unit: "rows", action };
}

/** The quality default, except that drop warns: no row can be dropped after the refresh. */
function tableAction(context: Context): TableCheck["action"] {
  const quality = { ...context.pack.defaults.quality, ...context.standard.value.quality };
  return quality.default === "fail" ? "fail" : "warn";
}

function rulesOf(value: unknown): Rule[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

/** The rule's name, else `<column>_<metric>`, in lower case. */
function nameOf(column: string, rule: Rule): string {
  const given = typeof rule.name === "string" ? rule.name : `${column}_${String(rule.metric)}`;
  return given.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
}

function unique(names: Set<string>, name: string): string {
  let candidate = name;
  for (let n = 2; names.has(candidate); n += 1) candidate = `${name}_${n}`;
  names.add(candidate);
  return candidate;
}

/** A rule allows no failing row: must be 0, at most 0, or fewer than 1 row. */
function allowsNone(rule: Rule): boolean {
  const rows = rule.unit === undefined || rule.unit === "rows";
  return rule.mustBe === 0 || rule.mustBeLessOrEqualTo === 0 || (rows && rule.mustBeLessThan === 1);
}

/** The check of one row a column rule becomes, or undefined when it has none. */
function rowCheck(column: string, rule: Rule): string | undefined {
  if ((rule.type ?? "library") !== "library" || !allowsNone(rule)) return undefined;
  const args = isRecord(rule.arguments) ? rule.arguments : {};
  return metrics[String(rule.metric)]?.(`\`${column}\``, args);
}

type Metric = (name: string, args: Record<string, unknown>) => string | undefined;

/** Each metric that a check of one row can hold, as SQL. */
const metrics: Record<string, Metric> = {
  nullValues: (name) => `${name} IS NOT NULL`,
  missingValues: (name, { missingValues: listed }) => {
    if (!Array.isArray(listed)) return undefined;
    const values = listed.filter((value) => value !== null);
    const notIn = values.length > 0 ? `${name} NOT IN (${values.map(literal).join(", ")})` : "";
    // Null counts as missing only when the list names it.
    if (values.length < listed.length)
      return [`${name} IS NOT NULL`, notIn].filter(Boolean).join(" AND ");
    return notIn ? `${name} IS NULL OR ${notIn}` : undefined;
  },
  invalidValues: (name, { validValues, pattern }) => {
    if (Array.isArray(validValues))
      return `${name} IS NULL OR ${name} IN (${validValues.map(literal).join(", ")})`;
    return typeof pattern === "string"
      ? `${name} IS NULL OR ${name} RLIKE ${literal(pattern)}`
      : undefined;
  },
};

/** Warns at a rule that is not checked: over all rows only with checks on; another engine's never. */
function notChecked(context: Context, rule: Rule, at: Source, countable: boolean): void {
  if (rule.type === "text") return;
  const what =
    typeof rule.metric === "string" ? `"${rule.metric}"` : `A ${String(rule.type ?? "library")}`;
  if (!countable) {
    const why =
      rule.type === "custom"
        ? "Ingestron does not run other engines' checks"
        : "it has no comparison, such as mustBe: 0";
    context.reporter.warning(
      "QUALITY_RULE_NOT_CHECKED",
      `${what} rule is not checked: ${why}.`,
      at,
      "Write it as a library or sql rule with a comparison, such as mustBe: 0, to have it checked.",
    );
    return;
  }
  const platform = context.platform;
  context.reporter.warning(
    "QUALITY_RULE_NOT_CHECKED",
    `${what} rule compares a count over all rows, which is checked after each refresh only when manage.checks is on.`,
    at,
    "Turn on manage.checks in platform.yaml to run it after each refresh.",
    platform
      ? [
          {
            title: "Turn on manage.checks",
            edits: [{ file: platform.file, pointer: "/manage/checks", set: true }],
          },
        ]
      : [],
  );
}
