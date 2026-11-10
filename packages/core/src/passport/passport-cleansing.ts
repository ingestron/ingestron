// The passport's Cleansing list (spec/cli/passport.md, section 5): each column's
// operations, deduplicate and the time zone, in words.
import type { ColumnCleanse, ResolvedTable } from "@ingestron/definitions";
import { code } from "./passport-sections.js";
import { valueText } from "./passport-words.js";

/** What each operation is in words, in the order they are applied. */
const operations: {
  [Key in keyof ColumnCleanse]-?: (value: NonNullable<ColumnCleanse[Key]>) => string;
} = {
  timezone: (zones) => `converted from ${zones.from} to ${zones.to}`,
  trim: () => "spaces at either end removed",
  empty: () => "empty text becomes no value",
  map: (map) =>
    Object.entries(map)
      .map(([from, to]) => `${code(from)} becomes ${to === null ? "no value" : valueText(to)}`)
      .join(", "),
  case: (to) => `${to} case`,
  default: (value) => `no value becomes ${valueText(value)}`,
};

/** Each operation's name in words, for one the engine does not apply. */
const named: Record<string, string> = {
  "cleanse.timezone": "Time zone conversion",
  "cleanse.trim": "Removing spaces at either end",
  "cleanse.empty": "Turning empty text into no value",
  "cleanse.map": "Replacing values",
  "cleanse.case": "Changing case",
  "cleanse.default": "Filling in values",
  deduplicate: "Keeping one row for each key",
};

/** The Cleansing list: each column's operations, deduplicate and the time zone, in words. */
export function cleansingLines(table: ResolvedTable, unapplied: Map<string, string>): string[] {
  const skipped = (operation: string) => unapplied.has(`cleanse.${operation}`);
  const columns = Object.entries(table.cleanse?.columns ?? {}).flatMap(([column, cleanse]) => {
    const words = (Object.keys(operations) as (keyof ColumnCleanse)[])
      .filter((operation) => cleanse[operation] !== undefined && !skipped(operation))
      .map((operation) =>
        (operations[operation] as (value: unknown) => string)(cleanse[operation]),
      );
    return words.length > 0 ? [`- \`${column}\`: ${words.join("; ")}.`] : [];
  });
  const dedupe = table.cleanse?.deduplicate;
  const key = table.contract.primaryKey.map((column) => `\`${column}\``).join(", ");
  const deduplicate =
    dedupe && !unapplied.has("deduplicate")
      ? [
          `- One row for each ${key}: the last by ${dedupe.orderBy.map((column) => `\`${column}\``).join(", then ")}.`,
        ]
      : [];
  const notDone = [...unapplied]
    .filter(([feature]) => named[feature] !== undefined)
    .map(([feature, why]) => `- ${named[feature]} is not applied: ${why}.`);
  const done = [...columns, ...deduplicate];
  return [...(done.length > 0 ? done : ["- Nothing is cleansed."]), ...notDone, ...zoneLine(table)];
}

/** The time zone of the table's timestamps, when it has any. */
function zoneLine(table: ResolvedTable): string[] {
  if (!table.contract.columns.some((column) => column.logicalType === "timestamp")) return [];
  return [
    table.timezone !== undefined
      ? `- Its timestamps are in ${table.timezone}.`
      : "- Its timestamps are not all in one time zone: see each column above.",
  ];
}
