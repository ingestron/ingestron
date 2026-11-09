// The checks of a resolved table's intent: its audit column names (specification section
// 11.2), then what its packs say about each value (section 11.5).
import type { Context } from "../context/index.js";
import type { ResolvedTable } from "../pack/index.js";
import { checkAuditNames } from "./audit-names.js";
import type { IntentPlaces } from "./complete.js";
import { judgeIntent } from "./judge.js";

/** Checks the table's audit column names, then judges its intent. */
export function checkTableIntent(
  context: Context,
  table: ResolvedTable,
  places: IntentPlaces,
): void {
  checkAuditNames(context, table, places);
  judgeIntent(context, table, places);
}
