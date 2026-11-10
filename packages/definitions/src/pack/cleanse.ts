// What is done to a table's values and rows before its checks, in the resolved model
// (specification sections 6.1 and 6.2).

/**
 * What is done to one column's values, after the cast to the contract's types and before the
 * table's checks (specification section 6.1). The operations are applied in this order:
 * `timezone`, `trim`, `empty`, `map`, `case`, `default`.
 * @example { trim: true, empty: true, case: "lower" }
 * @public
 */
export interface ColumnCleanse {
  /** Converts a timestamp from one zone to another, where a column's zones are known. */
  timezone?: { from: string; to: string };
  /** Removes leading and trailing whitespace from text. */
  trim?: true;
  /** Turns an empty string into null. */
  empty?: true;
  /** Replaces the listed values exactly; a value of null turns it into null. */
  map?: Record<string, unknown>;
  /** Changes text to upper or lower case. */
  case?: "upper" | "lower";
  /** Replaces null with this value. */
  default?: unknown;
}

/**
 * What is done to a table's rows before its checks (specification sections 6.1 and 6.2):
 * the columns that have at least one operation, in the contract's order, and deduplicate.
 * @example { columns: { email: { trim: true, case: "lower" } }, deduplicate: { orderBy: ["updated_at"] } }
 * @public
 */
export interface TableCleanse {
  /** The operations of each column that has any, by column name, in the contract's order. */
  columns: Record<string, ColumnCleanse>;
  /** Keeps one row for each primary key: the last by these contract columns. */
  deduplicate?: { orderBy: string[] };
}
