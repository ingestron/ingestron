// A table's cleansing as written (specification sections 6.1 to 6.3).

/**
 * One column's cleansing as written (specification section 6.1). `trim: false`, `empty: false`
 * and `timezone: false` take away what the standard gives; `empty: null` turns empty text into
 * null.
 */
export interface ColumnCleanseDoc {
  /** A time zone conversion (specification section 6.3); `from` is the table's input zone when left out. */
  timezone?: false | { from?: string; to: string };
  trim?: boolean;
  empty?: null | false;
  map?: Record<string, string | number | boolean | null>;
  case?: "upper" | "lower";
  default?: string | number | boolean;
}

/** A table's own cleansing as written (specification sections 6.1 and 6.2). */
export interface CleanseDoc {
  columns?: Record<string, ColumnCleanseDoc>;
  deduplicate?: { order_by: string[] };
}
