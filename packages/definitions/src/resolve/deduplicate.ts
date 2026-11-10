// A table's deduplicate (specification section 6.2): its order columns, its contract's
// primary key, and whether the way the table is kept leaves anything to deduplicate.
import type { Fix } from "@ingestron/config";
import type { Context } from "../context/index.js";
import type { Source } from "../diagnostics/index.js";
import type { ResolvedTable } from "../pack/index.js";
import { placeOf, reportColumn, type OwnCleanse } from "./cleanse-checks.js";

/** What checking deduplicate found: whether it is fine to resolve, and whether to judge it. */
export interface DeduplicateChecks {
  fine: boolean;
  /** False when `DEDUPLICATE_KEY` or `DEDUPLICATE_MODE` already says it cannot be applied. */
  judge: boolean;
}

/**
 * `CLEANSE_COLUMN` for an `order_by` column the contract does not list, `DEDUPLICATE_KEY` for
 * a contract with no primary key, and `DEDUPLICATE_MODE` for a table whose history already
 * decides what is kept per key (a warning) or whose store appends (an error).
 */
export function checkDeduplicate(
  context: Context,
  table: ResolvedTable,
  own: OwnCleanse,
): DeduplicateChecks {
  const dedupe = own.doc?.deduplicate;
  if (!dedupe) return { fine: true, judge: false };
  const at = placeOf(own, "deduplicate");
  let fine = true;
  dedupe.order_by.forEach((name, index) => {
    if (table.contract.columns.some((column) => column.name === name)) return;
    reportColumn(
      context,
      table.contract,
      name,
      placeOf(own, "deduplicate", "order_by", String(index)),
    );
    fine = false;
  });
  if (table.contract.primaryKey.length === 0) {
    context.reporter.error(
      "DEDUPLICATE_KEY",
      `"${table.name}" has no primary key, so deduplicate cannot tell which rows belong together.`,
      at,
      `Mark the key columns \`primaryKey: true\` in contract "${table.contract.id}".`,
    );
    return { fine: false, judge: false };
  }
  const mode = checkMode(context, table, at);
  return { fine: fine && mode !== "error", judge: mode === undefined };
}

/** True when the table's store step appends rows: its method has a `mode` alias set to `append`. */
function appends(context: Context, table: ResolvedTable): boolean {
  if (!table.store) return false;
  const method = context.pack.methods[table.store.method];
  return method?.aliases?.mode !== undefined && table.store.settings.mode === "append";
}

function checkMode(
  context: Context,
  table: ResolvedTable,
  at: Source,
): "warning" | "error" | undefined {
  if (!table.store || table.endsAtFiles) return undefined;
  const history = table.intent.history;
  if (history === "latest" || history === "full") {
    const fix: Fix = {
      title: "Remove deduplicate",
      edits: [{ file: at.document.file, pointer: at.pointer, remove: true }],
    };
    context.reporter.warning(
      "DEDUPLICATE_MODE",
      `Deduplicate is redundant for "${table.name}": its history is ${history}, which already decides what is kept for each key.`,
      at,
      "Remove deduplicate.",
      [fix],
      { feature: "deduplicate" },
    );
    return "warning";
  }
  if (!appends(context, table)) return undefined;
  context.reporter.error(
    "DEDUPLICATE_MODE",
    `Deduplicate cannot work for "${table.name}": its store appends rows, and rows already kept cannot be deduplicated.`,
    at,
    "Set history: latest to keep one row per key, or deduplicate in a transform that reads this table.",
  );
  return "error";
}
