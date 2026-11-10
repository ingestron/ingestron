// What the engine that keeps a table does not apply, and why, for the passport's section 5
// (spec/cli/passport.md): from the environment's warnings, accepted or not.
import type { Diagnostic, ResolvedTable } from "@ingestron/definitions";

/** The pack of the step that keeps the table: its store, else its transform, else its ingest. */
export function keeperOf(table: ResolvedTable): string | undefined {
  if (table.endsAtFiles) return table.ingest?.pack;
  return (table.store ?? table.transform ?? table.ingest)?.pack;
}

/** The reason in a `NOT_APPLIED` message, `<what> isn't applied on <pack>: <reason>`. */
function reasonOf(message: string): string {
  const reason = /isn't applied on [^:]+: (.*)$/s.exec(message)?.[1] ?? message;
  return reason.trim().replace(/\.$/, "");
}

/** The duty a reason says the feature is applied only with, if it says one. */
function dutyOf(reason: string): string | undefined {
  return /applied only in a layer whose does lists (\w+)/.exec(reason)?.[1];
}

/**
 * Why each feature of the table is not applied, by feature (a rule kind, an action,
 * `table-checks`, `quarantine`, a `cleanse.` path or `deduplicate`): from the warnings about
 * the table, accepted or not. A warning about several tables has no table; it is the table's
 * when it names the pack that keeps the table and, for a reason that names a duty, the
 * table's layer lacks that duty.
 */
export function notApplied(
  table: ResolvedTable,
  notes: readonly Diagnostic[],
): Map<string, string> {
  const found = new Map<string, string>();
  const keeper = keeperOf(table);
  const own = notes.filter((note) => note.subject?.table === table.name);
  const shared = notes.filter((note) => {
    if (note.subject?.table !== undefined || keeper === undefined) return false;
    if (!note.message.includes(`isn't applied on ${keeper}:`)) return false;
    const duty = dutyOf(note.message);
    return duty === undefined || !(Array.isArray(table.does) && table.does.includes(duty as never));
  });
  for (const note of [...own, ...shared]) {
    const feature = note.subject?.feature;
    if (note.code !== "NOT_APPLIED" || feature === undefined || found.has(feature)) continue;
    found.set(feature, reasonOf(note.message));
  }
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
