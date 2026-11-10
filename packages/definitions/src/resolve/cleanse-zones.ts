// Which columns of a table are converted from one time zone to another (specification
// section 6.3), from what the table writes and the standard's `cleanse.timestamps`.
import type { Context } from "../context/index.js";
import type { Source } from "../diagnostics/index.js";
import type { Column, ResolvedTable } from "../pack/index.js";
import { placeOf, type OwnCleanse } from "./cleanse-checks.js";
import { inputZone, isKnownZone } from "./timezones.js";

/** One planned column: the zones it is converted between, and whether the table wrote it. */
export interface Conversion {
  from: string;
  to: string;
  written: boolean;
}

/** What a table converts, and whether it could be worked out. */
export interface ConversionPlan {
  /** Every column the table puts in a zone, whether or not that changes its values. */
  columns: Map<string, Conversion>;
  /** False when `TIMEZONE_SOURCE` was reported. */
  fine: boolean;
}

/** True for a column typed `timestamp`, or untyped and written. */
function convertible(column: Column, written: boolean): boolean {
  return column.logicalType === "timestamp" || (column.logicalType === undefined && written);
}

/** What a column is to be converted to, from where if it says, and whether the table wrote it. */
interface Wanted {
  to: string;
  from: string | undefined;
  written: boolean;
}

/**
 * What the column is to have: its own `timezone`, else the standard's `to` for a timestamp
 * column, unless the column says `false`. Nothing when a name is not a zone: that is reported
 * with the table's columns.
 */
function wantedFor(
  context: Context,
  column: Column,
  own: OwnCleanse,
  standardTo: string | undefined,
): Wanted | undefined {
  const writing = own.doc?.columns?.[column.name]?.timezone;
  if (writing === false || !convertible(column, writing !== undefined)) return undefined;
  return wanted(context, writing, standardTo);
}

/** The column's own `timezone`, else the standard's `to`, if what they name are zones. */
function wanted(
  context: Context,
  writing: { from?: string; to: string } | undefined,
  standardTo: string | undefined,
): Wanted | undefined {
  const to = writing?.to ?? standardTo;
  const names = [to, writing?.from].filter((name) => name !== undefined);
  if (to === undefined || !names.every((name) => isKnownZone(context, name))) return undefined;
  return { to, from: writing?.from, written: writing !== undefined };
}

/**
 * The conversion of each column that has one. `from` is the column's own, else the input zone;
 * with neither, `TIMEZONE_SOURCE`.
 */
export function planConversions(
  context: Context,
  table: ResolvedTable,
  own: OwnCleanse,
  standardTo: string | undefined,
): ConversionPlan {
  const columns = new Map<string, Conversion>();
  const input = inputZone(own.zones);
  let fine = true;
  for (const column of table.contract.columns) {
    const wanted = wantedFor(context, column, own, standardTo);
    if (!wanted) continue;
    const from = wanted.from ?? input;
    if (from !== undefined) {
      columns.set(column.name, { from, to: wanted.to, written: wanted.written });
      continue;
    }
    const at = wanted.written ? placeOf(own, "columns", column.name, "timezone") : own.zones.at;
    reportSource(context, { table, column: column.name, own }, at);
    fine = false;
  }
  return { columns, fine };
}

/** The table and column that have no zone to convert from, and the zones the inputs are in. */
interface Missing {
  table: ResolvedTable;
  column: string;
  own: OwnCleanse;
}

/** `TIMEZONE_SOURCE` at `at`: the column is converted from a zone that nothing gives. */
function reportSource(context: Context, { table, column, own }: Missing, at: Source): void {
  const found = [...new Set(own.zones.zones.map((zone) => zone ?? "more than one"))];
  context.reporter.error(
    "TIMEZONE_SOURCE",
    `The inputs of "${table.name}" are in different time zones (${found.join(", ")}), so "${column}" needs a "from" zone.`,
    at,
    `Write timezone: { from: <zone>, to: <zone> } for "${column}".`,
  );
}
