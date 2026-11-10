// A contract's ODCS quality rules: those that hold for every row become
// checks a row can be held to; the rest compare counts over all rows, which a
// check of one row cannot, and are warnings (specification section 6).
import type { Context } from "../context/index.js";
import type { Source } from "../diagnostics/index.js";
import { isOn } from "../context/index.js";
import { isRecord } from "../internal/index.js";
import {
  nameOf,
  notChecked,
  rulesOf,
  type Entry,
  type Rule,
  type UncheckedRule,
} from "./quality-notes.js";
import { tableCheckOf, type RowRule, type TableCheck } from "../pack/index.js";
import { literal, optionChecks } from "./type-options.js";

/** A check made from a contract rule, before its action is chosen. */
export interface RuleCheck {
  name: string;
  check: string;
  rule?: RowRule;
}

/** A contract object's rules: checks of each row, and checks over all rows, with their places. */
export interface ObjectChecks {
  rows: (RuleCheck & { at: Source })[];
  table: TableCheck[];
  /** Where each of `table` was written, in the same order. */
  tableAt: Source[];
  /** Rules nothing checks, and why; text rules among them. */
  unchecked: UncheckedRule[];
}

/** The checks of one contract object's rules; warns at each rule it does not check. */
export function ruleChecks(context: Context, entry: Entry, at: Source): ObjectChecks {
  const names = new Set<string>();
  const found: ObjectChecks = { rows: [], table: [], tableAt: [], unchecked: [] };
  const action = tableAction(context);
  rulesOf(entry.quality).forEach((rule, index) => {
    const name = unique(names, nameOf(entry.name, rule));
    const where = { ...at, pointer: `${at.pointer}/quality/${index}` };
    overTable(context, found, tableCheckOf(rule, name, undefined, action), { rule, name }, where);
  });
  (entry.properties ?? []).forEach((property, column) => {
    const own = `${at.pointer}/properties/${column}`;
    for (const { option, ...check } of optionChecks(property.name, property.logicalTypeOptions))
      found.rows.push({
        ...check,
        name: unique(names, check.name),
        at: { ...at, pointer: `${own}/logicalTypeOptions/${option}` },
      });
    rulesOf(property.quality).forEach((rule, index) => {
      const name = unique(names, nameOf(property.name, rule));
      const where = { ...at, pointer: `${own}/quality/${index}` };
      const check = rowCheck(property.name, rule);
      if (check) found.rows.push({ name, ...check, at: where });
      else
        overTable(
          context,
          found,
          tableCheckOf(rule, name, property.name, action),
          { rule, name },
          where,
        );
    });
    if (property.unique === true && isOn(context, "checks")) {
      found.table.push(
        uniqueCheck(unique(names, `${property.name}_unique`), property.name, action),
      );
      found.tableAt.push({ ...at, pointer: `${own}/unique` });
    }
  });
  return found;
}

/** A table check runs when checks are on; otherwise, or when it cannot be one, the rule warns. */
function overTable(
  context: Context,
  found: ObjectChecks,
  check: TableCheck | undefined,
  named: { rule: Rule; name: string },
  at: Source,
): void {
  if (check && isOn(context, "checks")) {
    found.table.push(check);
    found.tableAt.push(at);
  } else found.unchecked.push(notChecked(context, named, at, check !== undefined));
}

function uniqueCheck(name: string, column: string, action: TableCheck["action"]): TableCheck {
  const base = { name, metric: "duplicateValues" as const, columns: [column], arguments: {} };
  return { ...base, operator: "mustBe", value: 0, unit: "rows", action };
}

/** The quality default, except that drop warns: no row can be dropped after the refresh. */
function tableAction(context: Context): TableCheck["action"] {
  const quality = { ...context.pack.defaults.quality, ...context.standard.value.quality };
  return tableCheckAction(quality.default);
}

/** A table check fails when the quality default is `fail`, and otherwise warns. */
export function tableCheckAction(action: "warn" | "drop" | "fail"): TableCheck["action"] {
  return action === "fail" ? "fail" : "warn";
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
export function rowCheck(column: string, rule: Rule): Omit<RuleCheck, "name"> | undefined {
  if ((rule.type ?? "library") !== "library" || !allowsNone(rule)) return undefined;
  const args = isRecord(rule.arguments) ? rule.arguments : {};
  return metrics[String(rule.metric)]?.(column, args);
}

type Metric = (
  column: string,
  args: Record<string, unknown>,
) => Omit<RuleCheck, "name"> | undefined;

/** Each metric that a check of one row can hold, as SQL and as a rule. */
const metrics: Record<string, Metric> = {
  nullValues: (column) => ({
    check: `\`${column}\` IS NOT NULL`,
    rule: { kind: "notNull", column },
  }),
  missingValues: (column, { missingValues: listed }) => {
    if (!Array.isArray(listed)) return undefined;
    const name = `\`${column}\``;
    const values = listed.filter((value) => value !== null);
    const notIn = values.length > 0 ? `${name} NOT IN (${values.map(literal).join(", ")})` : "";
    // Null counts as missing only when the list names it.
    if (values.length < listed.length) {
      const check = [`${name} IS NOT NULL`, notIn].filter(Boolean).join(" AND ");
      const rule: RowRule = notIn
        ? { kind: "notIn", column, values: values.map(asWritten), allowNull: false }
        : { kind: "notNull", column };
      return { check, rule };
    }
    return notIn
      ? {
          check: `${name} IS NULL OR ${notIn}`,
          rule: { kind: "notIn", column, values: values.map(asWritten), allowNull: true },
        }
      : undefined;
  },
  invalidValues: (column, { validValues, pattern }) => {
    const name = `\`${column}\``;
    if (Array.isArray(validValues))
      return {
        check: `${name} IS NULL OR ${name} IN (${validValues.map(literal).join(", ")})`,
        rule: { kind: "in", column, values: validValues.map(asWritten), allowNull: true },
      };
    return typeof pattern === "string"
      ? {
          check: `${name} IS NULL OR ${name} RLIKE ${literal(pattern)}`,
          rule: { kind: "pattern", column, pattern },
        }
      : undefined;
  },
};

/**
 * A listed value as the check text compares it (`literal`): a number as it is, anything
 * else, null and booleans among them, as its text. So the rule and the text never differ.
 */
function asWritten(value: unknown): unknown {
  return typeof value === "number" ? value : String(value);
}
