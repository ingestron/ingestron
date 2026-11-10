// A table's cleansing (specification sections 6.1 and 6.2): the standard's defaults for its
// text columns, its own columns, and deduplicate, checked against its contract and its layer,
// then judged against the pack that keeps it.
import type { Context } from "../context/index.js";
import type { ColumnCleanseDoc, StandardDoc } from "../documents/index.js";
import type { Column, ColumnCleanse, ResolvedTable, TableCleanse } from "../pack/index.js";
import {
  checkColumns,
  operations,
  placeOf,
  writtenOf,
  type Operation,
  type OwnCleanse,
} from "./cleanse-checks.js";
import { isText } from "./cleanse-fit.js";
import { judgeCleansing, type UsedOperations } from "./cleanse-judging.js";
import { checkDeduplicate } from "./deduplicate.js";
import { listsDuty, requireDuty } from "./layer-duties.js";

export type { OwnCleanse } from "./cleanse-checks.js";

/** The standard's text defaults for cleansing. */
type TextDefaults = NonNullable<StandardDoc["cleanse"]>["text"];

/**
 * Gives the table its `cleanse`, after checking what it writes: the layer's duties, the
 * contract's columns and types, and deduplicate. When anything is reported the table has none.
 * Then judges each operation, and deduplicate, against the pack that keeps the table.
 */
export function applyCleansing(context: Context, table: ResolvedTable, own: OwnCleanse): void {
  const duties = checkDuties(context, table, own);
  const columns = checkColumns(context, table.contract, own);
  const dedupe = checkDeduplicate(context, table, own);
  if (!duties || !columns || !dedupe.fine) return;
  const used: UsedOperations = { fromStandard: new Set(), written: [] };
  const cleanse = resolveCleanse(context, table, own, used);
  if (!cleanse) return;
  table.cleanse = cleanse;
  judgeCleansing(context, table, { own, used, deduplicate: dedupe.judge && !!cleanse.deduplicate });
}

/** `LAYER_RESPONSIBILITY` for cleansing or deduplicate the table's layer does not do. */
function checkDuties(context: Context, table: ResolvedTable, own: OwnCleanse): boolean {
  const { doc } = own;
  const writes = Object.values(doc?.columns ?? {}).some((block) =>
    operations.some((operation) => writtenOf(block, operation) !== undefined),
  );
  const cleansing =
    !writes || requireDuty(context, table, "cleanse", "cleansing", placeOf(own, "columns"));
  const deduplicating =
    !doc?.deduplicate ||
    requireDuty(context, table, "deduplicate", "deduplicating", placeOf(own, "deduplicate"));
  return cleansing && deduplicating;
}

/** The standard's text defaults when they reach the table, else none. */
function defaultsFor(context: Context, table: ResolvedTable): TextDefaults {
  if (table.endsAtFiles) return undefined;
  const reached =
    table.does === undefined ? table.origin.kind === "Flow" : listsDuty(table.does, "cleanse");
  return reached ? context.standard.value.cleanse?.text : undefined;
}

/**
 * The table's cleansing: the standard's defaults for text columns, then the columns it writes.
 * `used` records which operations came from the standard and which the table wrote.
 */
function resolveCleanse(
  context: Context,
  table: ResolvedTable,
  own: OwnCleanse,
  used: UsedOperations,
): TableCleanse | undefined {
  const text = defaultsFor(context, table);
  const columns: Record<string, ColumnCleanse> = {};
  for (const column of table.contract.columns) {
    const block = own.doc?.columns?.[column.name] ?? {};
    const resolved = columnCleanse({ column, block, text }, used);
    if (Object.keys(resolved).length > 0) columns[column.name] = resolved;
  }
  const dedupe = own.doc?.deduplicate;
  if (Object.keys(columns).length === 0 && !dedupe) return undefined;
  return { columns, ...(dedupe && { deduplicate: { orderBy: [...dedupe.order_by] } }) };
}

/** A column, what the table writes for it, and the standard's defaults. */
interface ColumnWriting {
  column: Column;
  block: ColumnCleanseDoc;
  text: TextDefaults;
}

/** One column's operations, in the order they are applied. */
function columnCleanse(writing: ColumnWriting, used: UsedOperations): ColumnCleanse {
  const resolved: Record<string, unknown> = {};
  for (const operation of operations) {
    const own = writtenOf(writing.block, operation);
    const value = own ?? fromStandard(writing, operation);
    if (value === undefined) continue;
    resolved[operation] = value;
    if (own !== undefined) used.written.push({ column: writing.column.name, operation });
    else used.fromStandard.add(operation as "trim" | "empty");
  }
  return resolved as ColumnCleanse;
}

/** `true` when the standard's text defaults give the operation to the column and it did not say. */
function fromStandard(
  { column, block, text }: ColumnWriting,
  operation: Operation,
): true | undefined {
  if (operation !== "trim" && operation !== "empty") return undefined;
  if (!isText(column) || block[operation] !== undefined) return undefined;
  const given = operation === "trim" ? text?.trim === true : text?.empty === null;
  return given ? true : undefined;
}
