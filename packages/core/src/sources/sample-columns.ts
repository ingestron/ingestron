// The columns of a sample's records, with the narrowest type each column's values fit
// (spec/cli/sources.md, section 2.2). The values are read for their types and are then dropped.
import type { SourceColumnDoc } from "@ingestron/definitions";
import { typeOf } from "../sample-type.js";
import { isRecord, maxNesting } from "./records.js";

/** The name given to the element of a list. */
export const itemsName = "items";

/** Each name found in the records, in the order first found; an empty name is not a column. */
const namesOf = (records: Record<string, unknown>[]): string[] => [
  ...new Set(records.flatMap((record) => Object.keys(record)).filter((name) => name !== "")),
];

/**
 * True when every record has the same set of keys. Records whose keys differ are a dictionary
 * keyed by values, such as customer codes, whose keys are data and are never written.
 */
function sameKeys(records: Record<string, unknown>[]): boolean {
  const [first, ...rest] = records.map((record) => Object.keys(record).sort().join("\u0000"));
  return rest.every((keys) => keys === first);
}

function inferColumn(name: string, values: unknown[], depth: number): SourceColumnDoc {
  const present = values.filter((value) => value !== "" && value != null);
  const logicalType = typeOf(present);
  const column: SourceColumnDoc = { name, logicalType, required: false };
  if (depth >= maxNesting) return column;
  if (logicalType === "object") {
    const records = present.filter(isRecord);
    if (sameKeys(records)) column.properties = columnsAt(records, namesOf(records), depth + 1);
  }
  if (logicalType === "array") column.items = inferColumn(itemsName, present.flat(), depth + 1);
  return column;
}

function columnsAt(
  records: Record<string, unknown>[],
  names: string[],
  depth: number,
): SourceColumnDoc[] {
  return names.map((name) =>
    inferColumn(
      name,
      records.map((record) => record[name]),
      depth,
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
  );
}
