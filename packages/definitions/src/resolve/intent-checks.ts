// The checks of a resolved table: its audit column names (specification section 11.2), what
// its packs say about each intent value (section 11.5), then about its checks (section 11.7).
import type { Context } from "../context/index.js";
import type { ResolvedTable } from "../pack/index.js";
import { checkAuditNames } from "./audit-names.js";
import type { IntentPlaces } from "./complete.js";
import { judgeIntent } from "./judge.js";
import { judgeQuality, type OwnExpectations } from "./quality-judging.js";

/** Checks the table's audit column names, then judges its intent, then its checks. */
export function checkTableIntent(
  context: Context,
  table: ResolvedTable,
  places: IntentPlaces,
  own: OwnExpectations,
): void {
  checkAuditNames(context, table, places);
  judgeIntent(context, table, places);
  judgeQuality(context, table, own);
}
