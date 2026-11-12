// The columns of a sample's records, with the narrowest type each column's values fit
// (spec/cli/sources.md, section 2.2). The values are read for their types and are then dropped.
import type { SourceColumnDoc } from "@ingestron/definitions";
import { typeOf } from "../sample-type.js";
import { keysOf } from "./key-order.js";
import { isRecord, maxNesting } from "./records.js";

/** The name given to the element of a list. */
export const itemsName = "items";

/** Each name found in the records, in the order first found; an empty name is not a column. */
const namesOf = (records: Record<string, unknown>[]): string[] => [
  ...new Set(records.flatMap((record) => keysOf(record)).filter((name) => name !== "")),
];

/** The most different keys a record may have for them to be names and not data. */
const mostKeys = 100;

/** What a key looks like when it is data: a date, a number, a UUID, or text no name holds. */
const dataKeys = [
  /^\d{4}-\d{2}-\d{2}/,
  /^-?\d+(\.\d+)?$/,
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  /[^A-Za-z0-9_ $.-]/,
];

/**
 * True when the keys of the records are names that the records share, so that each is a field. They
 * are not when any looks like data, such as a date or a customer's code, or there are more than
 * 100; and the records show that the keys are shared only when the sample is one record and holds
 * one record here, or a key is in every record here and every key is in at least two of them
 * (spec/cli/sources.md, section 2.2).
 */
function sharedNames(
  records: Record<string, unknown>[],
  names: string[],
  oneRecordSample: boolean,
): boolean {
  if (names.length > mostKeys || names.some((key) => dataKeys.some((data) => data.test(key))))
    return false;
  if (oneRecordSample && records.length === 1) return true;
  const holding = new Map<string, number>();
  for (const record of records)
    for (const key of new Set(keysOf(record))) holding.set(key, (holding.get(key) ?? 0) + 1);
  const counts = names.map((key) => holding.get(key) ?? 0);
  return counts.some((count) => count === records.length) && counts.every((count) => count >= 2);
}

/** True for a record with a key; one with none, or only an empty one, counts as no record. */
const hasKey = (record: Record<string, unknown>): boolean =>
  keysOf(record).some((key) => key !== "");

function inferColumn(
  name: string,
  values: unknown[],
  depth: number,
  single: boolean,
): SourceColumnDoc {
  const present = values.filter((value) => value !== "" && value != null);
  const logicalType = typeOf(present);
  const column: SourceColumnDoc = { name, logicalType, required: false };
  if (depth >= maxNesting) return column;
  if (logicalType === "object") {
    const records = present.filter(isRecord).filter(hasKey);
    const names = namesOf(records);
    if (sharedNames(records, names, single))
      column.properties = columnsAt(records, names, depth + 1, single);
  }
  if (logicalType === "array")
    column.items = inferColumn(itemsName, present.flat(), depth + 1, single);
  return column;
}

function columnsAt(
  records: Record<string, unknown>[],
  names: string[],
  depth: number,
  single: boolean,
): SourceColumnDoc[] {
  return names.map((name) =>
    inferColumn(
      name,
      records.map((record) => (Object.hasOwn(record, name) ? record[name] : undefined)),
      depth,
      single,
    ),
  );
}

/**
 * Each name found in the records, in the order first found, with its inferred column. `names`
 * gives the order when the file does (a CSV header): an object keeps names such as `2023` first.
 * An empty name is left out, and a column nested deeper than `maxNesting` has no nested fields.
 */
export function inferColumns(
  records: Record<string, unknown>[],
  names = namesOf(records),
): SourceColumnDoc[] {
  return columnsAt(
    records,
    names.filter((name) => name !== ""),
    0,
    records.length === 1,
  );
}
