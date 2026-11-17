// How a flow's triggers load a table (specification section 5.1): a schedule on an incremental
// table needs a lookback that covers the gap between runs, and a trigger that reloads or
// overlaps rows needs a key to merge them by.
import type { Context } from "../context/index.js";
import type { ResolvedTable } from "../pack/index.js";
import { durationMs, durationText, longestGap, type ResolvedTrigger } from "../triggers/index.js";

/** `TRIGGER_LOOKBACK` for a schedule with no lookback, or one shorter than its longest gap. */
function checkLookback(context: Context, trigger: ResolvedTrigger): void {
  if (trigger.type !== "schedule" || trigger.parameters.load === "full") return;
  if (trigger.lookback === undefined) {
    context.reporter.error(
      "TRIGGER_LOOKBACK",
      `"${trigger.name}" runs an incremental table on a schedule; give it a \`lookback\`, or \`load: full\`.`,
      trigger.at_source,
      "A lookback makes each run read back over the last one, so a missed run is covered.",
    );
    return;
  }
  const lookback = durationMs(trigger.lookback);
  const gap = longestGap(trigger);
  if (lookback === undefined || gap === undefined || lookback >= gap) return;
  context.reporter.error(
    "TRIGGER_LOOKBACK",
    `"${trigger.name}"'s lookback ${trigger.lookback} is shorter than its longest gap between runs, ${durationText(gap)}.`,
    trigger.at_source,
    `Give it a lookback of at least ${durationText(gap)}.`,
  );
}

/** Why the table cannot merge the rows a trigger reloads or overlaps, if it cannot. */
function unmergeable(table: ResolvedTable): string | undefined {
  if (table.contract.primaryKey.length === 0)
    return "which has no primary key; declare one in its contract, or in its source metadata";
  if (table.endsAtFiles !== undefined || table.intent.history === "none")
    return "whose store keeps every row as it arrived (`history: none`), so overlapping rows would be duplicated";
  return undefined;
}

/**
 * True when each run replaces the table's rows rather than appending them: a snapshot layout on a
 * table that is not incremental, kept by a store that replaces them (`history` other than `none`)
 * or ending at the landed files, whose one file each run replaces.
 */
function replacedEachRun(table: ResolvedTable): boolean {
  if (table.ingest?.settings.layout !== "snapshot") return false;
  if (table.intent.load?.mode === "incremental") return false;
  return table.endsAtFiles !== undefined || table.intent.history !== "none";
}

/** `TRIGGER_KEY` for a trigger that reloads or overlaps rows of a table that cannot merge them. */
function checkKey(context: Context, table: ResolvedTable, trigger: ResolvedTrigger): void {
  if (replacedEachRun(table)) return;
  const reason = unmergeable(table);
  if (reason === undefined) return;
  context.reporter.error(
    "TRIGGER_KEY",
    `"${trigger.name}" reloads or overlaps rows of ${table.name}, ${reason}.`,
    trigger.at_source,
    "Give the table a primary key, and keep it with `history: latest`, so that rows are merged by it.",
  );
}

/**
 * The checks of each trigger the table's flow writes, once for each trigger and table. A table
 * with no flow triggers, or one with only the default trigger, is not checked.
 * @param table - The table, once its intent is complete.
 */
export function checkLoads(context: Context, table: ResolvedTable): void {
  const incremental = table.intent.load?.mode === "incremental";
  for (const trigger of table.ingest?.triggers ?? []) {
    if (incremental) checkLookback(context, trigger);
    if (incremental || trigger.parameters.load === "full") checkKey(context, table, trigger);
  }
}
