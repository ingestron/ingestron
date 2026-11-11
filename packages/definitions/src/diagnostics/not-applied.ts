// Each table's features its keeping step does not apply, kept as they are reported, before
// a warning found for several tables loses its table (specification section 11.7).
import type { DiagnosticSubject } from "./diagnostics.js";

/**
 * A feature the step that keeps a table does not apply: the `NOT_APPLIED` warning's feature,
 * its reason, and for a time zone conversion the column.
 * @example { feature: "pattern", reason: "Its engine has no regular expressions." }
 * @public
 */
export interface NotApplied {
  /** The warning's feature (specification section 1.2), such as `pattern` or `cleanse.timezone`. */
  feature: string;
  /** Why it is not applied, as the warning gives it. */
  reason: string;
  /** For a time zone conversion, the column it is not applied to. */
  column?: string;
}

/** What a `NOT_APPLIED` warning says beyond its message: its reason, and the columns. */
export interface NotAppliedDetail {
  reason: string;
  /** For a time zone conversion, each column it is not applied to. */
  columns?: string[];
}

/** Each table's features not applied, as they are recorded. */
export interface NotAppliedBook {
  /** Records the warning's feature for its table, once for each column, each only once. */
  record(subject: DiagnosticSubject | undefined, detail: NotAppliedDetail | undefined): void;
  /** What is recorded for the table. */
  of(table: string): NotApplied[];
}

/** A new, empty record of each table's features not applied. */
export function notAppliedBook(): NotAppliedBook {
  const found = new Map<string, NotApplied[]>();
  return {
    record: (subject, detail) => {
      const table = subject?.table;
      const feature = subject?.feature;
      if (table === undefined || feature === undefined || detail === undefined) return;
      const list = found.get(table) ?? [];
      for (const column of detail.columns ?? [undefined]) addOnce(list, feature, detail, column);
      found.set(table, list);
    },
    of: (table) => found.get(table) ?? [],
  };
}

function addOnce(
  list: NotApplied[],
  feature: string,
  { reason }: NotAppliedDetail,
  column: string | undefined,
): void {
  const known = list.some(
    (other) => other.feature === feature && other.reason === reason && other.column === column,
  );
  if (!known) list.push({ feature, reason, ...(column !== undefined && { column }) });
}
