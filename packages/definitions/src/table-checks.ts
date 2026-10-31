// Contract rules that compare a count over all rows, as structured checks a
// pack runs after each refresh (specification section 6).
import { isRecord } from "./merge.js";

/** A rule over all rows: what is counted, how it is compared, and what a failure does. */
export interface TableCheck {
  /** The rule's name, or one made from the column and metric. */
  name: string;
  /** What is counted; `sql` runs the rule's own query. */
  metric: "nullValues" | "missingValues" | "invalidValues" | "duplicateValues" | "rowCount" | "sql";
  /** The columns counted: none for the whole table, several for duplicates of a combination. */
  columns: string[];
  /** The rule's ODCS arguments, such as `validValues`. */
  arguments: Record<string, unknown>;
  /** For an `sql` rule: the query that returns the number compared. */
  query?: string;
  operator:
    | "mustBe"
    | "mustNotBe"
    | "mustBeGreaterThan"
    | "mustBeGreaterOrEqualTo"
    | "mustBeLessThan"
    | "mustBeLessOrEqualTo"
    | "mustBeBetween"
    | "mustNotBeBetween";
  /** The number, or for a between the pair, compared with. */
  value: unknown;
  /** Whether the count is in rows or a percentage of all rows. */
  unit: "rows" | "percent";
  /** What a failing check does to the run. */
  action: "warn" | "fail";
}

const operators: TableCheck["operator"][] = [
  "mustBe",
  "mustNotBe",
  "mustBeGreaterThan",
  "mustBeGreaterOrEqualTo",
  "mustBeLessThan",
  "mustBeLessOrEqualTo",
  "mustBeBetween",
  "mustNotBeBetween",
];
const metrics = ["nullValues", "missingValues", "invalidValues", "duplicateValues", "rowCount"];

/**
 * The table check a rule becomes, or undefined when it has no comparison or
 * is not a library or sql rule. `column` is set for a column's rule.
 */
export function tableCheckOf(
  rule: Record<string, unknown>,
  name: string,
  column: string | undefined,
  action: TableCheck["action"],
): TableCheck | undefined {
  const operator = operators.find((key) => key in rule);
  const metric = metricOf(rule);
  if (!operator || !metric) return undefined;
  const args = isRecord(rule.arguments) ? rule.arguments : {};
  const combination = Array.isArray(args.properties) ? args.properties.map(String) : [];
  return {
    name,
    metric,
    columns: column ? [column] : combination,
    arguments: args,
    ...(metric === "sql" && { query: rule.query as string }),
    operator,
    value: rule[operator],
    unit: rule.unit === "percent" ? "percent" : "rows",
    action,
  };
}

/** `sql` for an sql rule with a query, the metric of a countable library rule, otherwise undefined. */
function metricOf(rule: Record<string, unknown>): TableCheck["metric"] | undefined {
  const type = rule.type ?? "library";
  if (type === "sql") return typeof rule.query === "string" ? "sql" : undefined;
  const metric = String(rule.metric);
  return type === "library" && metrics.includes(metric)
    ? (metric as TableCheck["metric"])
    : undefined;
}
