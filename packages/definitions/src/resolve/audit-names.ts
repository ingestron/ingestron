// Each table's audit columns have names of their own (specification section 11.2): not
// another audit column's, nor a contract column's.
import type { Context } from "../context/index.js";
import type { Source } from "../diagnostics/index.js";
import type { ResolvedTable } from "../pack/index.js";
import type { IntentPlaces } from "./complete.js";

const hint = 'Give each audit column a name of its own with "as".';

/**
 * `BAD_SETTING` at an audit entry whose column name an earlier entry has, or a contract
 * column has, compared without case.
 */
export function checkAuditNames(
  context: Context,
  table: ResolvedTable,
  places: IntentPlaces,
): void {
  const columns = new Set(table.contract.columns.map((column) => column.name.toLowerCase()));
  const seen = new Set<string>();
  (table.intent.audit ?? []).forEach((entry, index) => {
    const name = entry.as.toLowerCase();
    const at = entryAt(table, places, index);
    if (seen.has(name))
      context.reporter.error(
        "BAD_SETTING",
        `The audit column "${entry.as}" is named twice.`,
        at,
        hint,
      );
    else if (columns.has(name))
      context.reporter.error(
        "BAD_SETTING",
        `The audit column "${entry.as}" has the name of a contract column.`,
        at,
        hint,
      );
    seen.add(name);
  });
}

/** Where the list's entry was written: the item of the written list, or the setting it came from. */
function entryAt(table: ResolvedTable, places: IntentPlaces, index: number): Source | undefined {
  const source = places.sources.audit;
  if (!source || table.intentOrigins.audit?.alias !== undefined) return source;
  return { document: source.document, pointer: `${source.pointer}/${index}` };
}
