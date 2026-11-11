// What the engine that keeps a table does not apply, and why, for the passport's section 5
// (spec/cli/passport.md): from the model's notApplied, accepted or not.
import type { ResolvedTable } from "@ingestron/definitions";

/** The pack of the step that keeps the table: its store, else its transform, else its ingest. */
export function keeperOf(table: ResolvedTable): string | undefined {
  if (table.endsAtFiles) return table.ingest?.pack;
  return (table.store ?? table.transform ?? table.ingest)?.pack;
}

/** A reason as a clause, without its closing full stop: the passport writes its own. */
function clause(reason: string): string {
  return reason.trim().replace(/\.$/, "");
}

/**
 * Why each feature of the table is not applied, by feature (a rule kind, an action,
 * `table-checks`, `quarantine`, a `cleanse.` path or `deduplicate`), from the model's
 * `notApplied`, which lists exactly this table's, accepted or not. A time zone conversion
 * not applied to a column is in {@link zonesNotApplied} instead.
 */
export function notApplied(table: ResolvedTable): Map<string, string> {
  const found = new Map<string, string>();
  for (const item of table.notApplied ?? [])
    if (item.column === undefined && !found.has(item.feature))
      found.set(item.feature, clause(item.reason));
  return found;
}

/** Each column whose time zone conversion is not applied, and why. */
export function zonesNotApplied(table: ResolvedTable): Map<string, string> {
  const found = new Map<string, string>();
  for (const item of table.notApplied ?? [])
    if (item.feature === "cleanse.timezone" && item.column !== undefined && !found.has(item.column))
      found.set(item.column, clause(item.reason));
  return found;
}

/** Only what the table has: a quarantine, results, an operation or deduplicate it asks for. */
export function relevant(
  table: ResolvedTable,
  unapplied: Map<string, string>,
): Map<string, string> {
  const operations = new Set(
    Object.values(table.cleanse?.columns ?? {}).flatMap((cleanse) =>
      Object.keys(cleanse).map((operation) => `cleanse.${operation}`),
    ),
  );
  const has = (feature: string): boolean => {
    if (feature === "quarantine") return table.quality?.quarantine === true;
    if (isResults(feature)) return table.quality?.results === true;
    if (feature === "deduplicate") return table.cleanse?.deduplicate !== undefined;
    if (feature.startsWith("cleanse.")) return operations.has(feature);
    return true;
  };
  return new Map([...unapplied].filter(([feature]) => has(feature)));
}

/** Whether the feature is keeping the checks' results, `quality.results`. */
export function isResults(feature: string): boolean {
  return feature === "quality.results" || feature.startsWith("quality.results=");
}
