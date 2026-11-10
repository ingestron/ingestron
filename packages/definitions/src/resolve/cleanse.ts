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
import { appliesTimezone, judgeCleansing, type UsedOperations } from "./cleanse-judging.js";
import { planConversions, type Conversion, type ConversionPlan } from "./cleanse-zones.js";
import { checkDeduplicate } from "./deduplicate.js";
import { listsDuty, requireDuty } from "./layer-duties.js";
import { inputZone, zoneAfter } from "./timezones.js";

export type { OwnCleanse } from "./cleanse-checks.js";

/** The standard's text defaults for cleansing. */
type TextDefaults = NonNullable<StandardDoc["cleanse"]>["text"];

/**
 * Gives the table its `cleanse` and its `timezone`, after checking what it writes: the layer's
 * duties, the contract's columns and types, the zones, and deduplicate. When anything is
 * reported the table has no `cleanse`, and its zone is its input zone. Then judges each
 * operation, and deduplicate, against the pack that keeps the table.
 */
export function applyCleansing(context: Context, table: ResolvedTable, own: OwnCleanse): void {
  const input = inputZone(own.zones);
  if (input !== undefined) table.timezone = input;
  const duties = checkDuties(context, table, own);
  const columns = checkColumns(context, table.contract, own);
  const dedupe = checkDeduplicate(context, table, own);
  const defaults = defaultsFor(context, table);
  const zones = planConversions(context, table, own, defaults.to);
  if (!duties || !columns || !dedupe.fine || !zones.fine) return;
  setZone(context, table, zones, input);
  const used: UsedOperations = { fromStandard: new Set(), written: [] };
  const cleanse = resolveCleanse({ table, own, defaults, zones }, used);
  if (!cleanse) return;
  table.cleanse = cleanse;
  judgeCleansing(context, table, { own, used, deduplicate: dedupe.judge && !!cleanse.deduplicate });
}

/**
 * The zone of the table's timestamps once it is built: the zone all its timestamp columns are in,
 * if one. A column is in the zone it converts to only when the step that keeps the table applies
 * conversion; otherwise it stays in the zone it was in, so a later table converts it.
 */
function setZone(
  context: Context,
  table: ResolvedTable,
  zones: ConversionPlan,
  input: string | undefined,
): void {
  const applied = appliesTimezone(context, table);
  const planned = new Map(
    [...zones.columns].map(([name, { from, to }]) => [name, { to: applied ? to : from }]),
  );
  const zone = zoneAfter(table.contract, planned, input);
  if (zone === undefined) delete table.timezone;
  else table.timezone = zone;
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

/** What the standard gives a table's columns: the text defaults and the zone for timestamps. */
interface Defaults {
  text?: TextDefaults;
  to?: string;
}

/** The standard's defaults when they reach the table, else none. */
function defaultsFor(context: Context, table: ResolvedTable): Defaults {
  if (table.endsAtFiles) return {};
  const reached =
    table.does === undefined ? table.origin.kind === "Flow" : listsDuty(table.does, "cleanse");
  const cleanse = reached ? context.standard.value.cleanse : undefined;
  return { text: cleanse?.text, to: cleanse?.timestamps?.to };
}

/** What resolving a table's cleansing reads. */
interface Resolving {
  table: ResolvedTable;
  own: OwnCleanse;
  defaults: Defaults;
  zones: ConversionPlan;
}

/**
 * The table's cleansing: the standard's defaults for text and timestamp columns, then the
 * columns it writes. `used` records which operations came from the standard and which the table
 * wrote.
 */
function resolveCleanse(
  { table, own, defaults, zones }: Resolving,
  used: UsedOperations,
): TableCleanse | undefined {
  const columns: Record<string, ColumnCleanse> = {};
  for (const column of table.contract.columns) {
    const block = own.doc?.columns?.[column.name] ?? {};
    const zone = zones.columns.get(column.name);
    const resolved = columnCleanse({ column, block, text: defaults.text, zone }, used);
    if (Object.keys(resolved).length > 0) columns[column.name] = resolved;
  }
  const dedupe = own.doc?.deduplicate;
  if (Object.keys(columns).length === 0 && !dedupe) return undefined;
  return { columns, ...(dedupe && { deduplicate: { orderBy: [...dedupe.order_by] } }) };
}

/** A column, what the table writes for it, the standard's defaults, and its planned conversion. */
interface ColumnWriting {
  column: Column;
  block: ColumnCleanseDoc;
  text: TextDefaults;
  zone: Conversion | undefined;
}

/** One column's operations, in the order they are applied. */
function columnCleanse(writing: ColumnWriting, used: UsedOperations): ColumnCleanse {
  const resolved: Record<string, unknown> = {};
  for (const operation of operations) {
    const converted = operation === "timezone";
    const own = converted
      ? writing.zone?.written || undefined
      : writtenOf(writing.block, operation);
    const value = converted ? zoneOf(writing.zone) : (own ?? fromStandard(writing, operation));
    if (value === undefined) continue;
    resolved[operation] = value;
    if (own !== undefined) used.written.push({ column: writing.column.name, operation });
    else used.fromStandard.add(operation as "trim" | "empty" | "timezone");
  }
  return resolved as ColumnCleanse;
}

/** The conversion to record: none when the column's zones are the same, so nothing changes. */
function zoneOf(zone: Conversion | undefined): { from: string; to: string } | undefined {
  return zone && zone.from !== zone.to ? { from: zone.from, to: zone.to } : undefined;
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
