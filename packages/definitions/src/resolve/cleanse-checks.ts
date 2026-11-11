// What a table's cleansing is judged against (specification section 6.1): the columns and
// types of its contract. Every problem is found in one run.
import type { Context } from "../context/index.js";
import type { Source } from "../diagnostics/index.js";
import type { CleanseDoc, ColumnCleanseDoc } from "../documents/index.js";
import type { Column, Contract } from "../pack/index.js";
import { columnsPlace } from "../sources/index.js";
import { fitsKey, fitsValue, isNotText, isNotTimestamp } from "./cleanse-fit.js";
import { checkZoneName, type InputZones } from "./timezones.js";

/**
 * A table's own cleansing and where its `cleanse` key is (or would be) written, and the zones
 * its inputs are in (specification section 6.3).
 */
export interface OwnCleanse {
  doc: CleanseDoc | undefined;
  at: Source;
  zones: InputZones;
}

/** The place `parts` below the table's `cleanse` key; a name is escaped as a JSON Pointer. */
export function placeOf(own: OwnCleanse, ...parts: string[]): Source {
  const path = parts.map((part) => part.replace(/~/g, "~0").replace(/\//g, "~1"));
  return { ...own.at, pointer: [own.at.pointer, ...path].join("/") };
}

/** The most columns a hint names. */
const listed = 10;

/** `CLEANSE_COLUMN` at `at`: the name is not a column of the contract. */
export function reportColumn(context: Context, contract: Contract, name: string, at: Source): void {
  const names = contract.columns.map((column) => column.name);
  const more = names.length > listed ? `, and ${names.length - listed} more` : "";
  const place = columnsPlace(contract);
  context.reporter.error(
    "CLEANSE_COLUMN",
    `"${name}" is not a column of ${place.of}.`,
    at,
    `Use a column the ${place.lists} lists: ${names.slice(0, listed).join(", ")}${more}.`,
  );
}

/** The operations a table writes for a column, in the order they are checked and applied. */
export const operations = ["timezone", "trim", "empty", "map", "case", "default"] as const;

/** One of the operations on a column. */
export type Operation = (typeof operations)[number];

/**
 * What a column's block asks for an operation: `trim: false`, `empty: false` and `timezone: false`
 * ask for none. A `timezone` is as written, whose `from` may be left to the table's input zone.
 */
export function writtenOf(block: ColumnCleanseDoc, operation: Operation): unknown {
  const asked: Record<Operation, unknown> = {
    timezone: block.timezone || undefined,
    trim: block.trim === true ? true : undefined,
    empty: block.empty === null ? true : undefined,
    map: block.map && { ...block.map },
    case: block.case,
    default: block.default,
  };
  return asked[operation];
}

/**
 * `CLEANSE_COLUMN` for a column the contract does not list and `CLEANSE_TYPE` for an operation
 * that does not fit the type of the column in the table's own contract, which is the type after
 * the cast. Returns false when anything was reported.
 */
export function checkColumns(context: Context, contract: Contract, own: OwnCleanse): boolean {
  const results = Object.entries(own.doc?.columns ?? {}).map(([name, block]) => {
    const column = contract.columns.find((candidate) => candidate.name === name);
    if (column) return checkColumn({ context, contract, column, own }, block);
    reportColumn(context, contract, name, placeOf(own, "columns", name));
    return false;
  });
  return !results.includes(false);
}

/** What is checked about one column: where its problems are reported and what it is. */
interface Subject {
  context: Context;
  contract: Contract;
  column: Column;
  own: OwnCleanse;
}

function checkColumn(subject: Subject, block: ColumnCleanseDoc): boolean {
  const results = [
    checkZone(subject, block),
    ...(["trim", "empty"] as const).map((operation) => checkText(subject, block, operation)),
    checkMap(subject, block),
    checkText(subject, block, "case"),
    checkDefault(subject, block),
  ];
  return !results.includes(false);
}

/**
 * `CLEANSE_TYPE` for a `timezone` written on a column that is not a timestamp, and
 * `TIMEZONE_NAME` for a `from` or `to` that is not a zone.
 */
function checkZone(subject: Subject, block: ColumnCleanseDoc): boolean {
  const { context, contract, column, own } = subject;
  const zone = block.timezone;
  if (!zone) return true;
  const typed = !isNotTimestamp(column);
  if (!typed) {
    context.reporter.error(
      "CLEANSE_TYPE",
      `"timezone" works on timestamps, and "${column.name}" is ${column.logicalType} in ${columnsPlace(contract).in}.`,
      placeOf(own, "columns", column.name, "timezone"),
      `Remove "timezone" from "${column.name}", or convert it where it is still a timestamp.`,
    );
  }
  const names = (["from", "to"] as const).flatMap((key) => {
    const name = zone[key];
    if (name === undefined) return [];
    return [checkZoneName(context, name, placeOf(own, "columns", column.name, "timezone", key))];
  });
  return typed && !names.includes(false);
}

/** `CLEANSE_TYPE` for `trim`, `empty` or `case` written on a column that is not text. */
function checkText(subject: Subject, block: ColumnCleanseDoc, operation: Operation): boolean {
  const { context, contract, column, own } = subject;
  if (writtenOf(block, operation) === undefined || !isNotText(column)) return true;
  context.reporter.error(
    "CLEANSE_TYPE",
    `"${operation}" works on text, and "${column.name}" is ${column.logicalType} in ${columnsPlace(contract).in}.`,
    placeOf(own, "columns", column.name, operation),
    `Remove "${operation}" from "${column.name}", or cleanse it where it is still text.`,
  );
  return false;
}

/** `CLEANSE_TYPE` at a `map` entry whose key or value does not fit the column. */
function checkMap(subject: Subject, block: ColumnCleanseDoc): boolean {
  const { column, own } = subject;
  const results = Object.entries(block.map ?? {}).flatMap(([key, value]) => {
    const at = placeOf(own, "columns", column.name, "map", key);
    return [
      fitsKey(column, key) || reportValue(subject, { what: '"map" key', value: key }, at),
      fitsValue(column, value) || reportValue(subject, { what: '"map" value', value }, at),
    ];
  });
  return !results.includes(false);
}

/** `CLEANSE_TYPE` at a `default` value that does not fit the column. */
function checkDefault(subject: Subject, block: ColumnCleanseDoc): boolean {
  const { column, own } = subject;
  if (block.default === undefined || fitsValue(column, block.default)) return true;
  const at = placeOf(own, "columns", column.name, "default");
  return reportValue(subject, { what: '"default" value', value: block.default }, at);
}

/** Reports a value that does not fit the column's type; always false. */
function reportValue(
  { context, contract, column }: Subject,
  item: { what: string; value: unknown },
  at: Source,
): false {
  context.reporter.error(
    "CLEANSE_TYPE",
    `The ${item.what} ${JSON.stringify(item.value)} doesn't fit "${column.name}", which is ${column.logicalType} in ${columnsPlace(contract).in}.`,
    at,
    "Give a value of the column's type.",
  );
  return false;
}
