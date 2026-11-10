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

/**
 * The Cleansing list: each column's operations, deduplicate and the time zone, in words.
 * `zones` are the columns whose time zone conversion is not applied, each with why.
 */
export function cleansingLines(
  table: ResolvedTable,
  unapplied: Map<string, string>,
  zones: Map<string, string>,
): string[] {
  const done = [...columnLines(table, unapplied, zones), ...dedupeLine(table, unapplied)];
  const notDone = [...unapplied]
    .filter(([feature]) => named[feature] !== undefined)
    .map(([feature, why]) => `- ${named[feature]} is not applied: ${why}.`);
  const zonesNotDone = [...zones].map(
    ([column, why]) => `- \`${column}\`: time zone conversion is not applied: ${why}.`,
  );
  return [
    ...(done.length > 0 ? done : ["- Nothing is cleansed."]),
    ...notDone,
    ...zonesNotDone,
    ...zoneLine(table),
  ];
}

/** Each column's operations the engine applies, in the order they are applied. */
function columnLines(
  table: ResolvedTable,
  unapplied: Map<string, string>,
  zones: Map<string, string>,
): string[] {
  return Object.entries(table.cleanse?.columns ?? {}).flatMap(([column, cleanse]) => {
    const applied = (operation: keyof ColumnCleanse) =>
      cleanse[operation] !== undefined &&
      !unapplied.has(`cleanse.${operation}`) &&
      !(operation === "timezone" && zones.has(column));
    const words = (Object.keys(operations) as (keyof ColumnCleanse)[])
      .filter(applied)
      .map((operation) =>
        (operations[operation] as (value: unknown) => string)(cleanse[operation]),
      );
    return words.length > 0 ? [`- \`${column}\`: ${words.join("; ")}.`] : [];
  });
}

/** One row for each key, when the table deduplicates and its engine applies it. */
function dedupeLine(table: ResolvedTable, unapplied: Map<string, string>): string[] {
  const dedupe = table.cleanse?.deduplicate;
  if (!dedupe || unapplied.has("deduplicate")) return [];
  const key = table.contract.primaryKey.map((column) => `\`${column}\``).join(", ");
  const order = dedupe.orderBy.map((column) => `\`${column}\``).join(", then ");
  return [`- One row for each ${key}: the last by ${order}.`];
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
