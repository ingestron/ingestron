// The columns of a sample's records, with the narrowest type each column's values fit
// (spec/cli/sources.md, section 2.2). The values are read for their types and are then dropped.
import type { SourceColumnDoc } from "@ingestron/definitions";
import { typeOf } from "../sample-type.js";
import { isRecord } from "./records.js";

/** The name given to the element of a list. */
export const itemsName = "items";

function inferColumn(name: string, values: unknown[]): SourceColumnDoc {
  const present = values.filter((value) => value !== "" && value != null);
  const logicalType = typeOf(present);
  const column: SourceColumnDoc = { name, logicalType, required: false };
  if (logicalType === "object") column.properties = inferColumns(present.filter(isRecord));
  if (logicalType === "array") column.items = inferColumn(itemsName, present.flat());
  return column;
}

/**
 * Each name found in the records, in the order first found, with its inferred column. `names`
 * gives the order when the file does (a CSV header): an object keeps names such as `2023` first.
 */
export function inferColumns(
  records: Record<string, unknown>[],
  names = [...new Set(records.flatMap((record) => Object.keys(record)))],
): SourceColumnDoc[] {
  return names.map((name) =>
    inferColumn(
      name,
      records.map((record) => record[name]),
    ),
  );
}
