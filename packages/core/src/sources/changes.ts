// What an import changed, and its text (spec/cli/sources.md, section 3, "What changed").
import {
  compareSourceColumns,
  type SourceBefore,
  type SourceCode,
  type SourceDifference,
  type SourceTableDoc,
} from "@ingestron/definitions";

/**
 * One table an import added, removed or changed.
 * @public
 */
export interface SourceChange {
  /** The table's `object`: the new document's spelling, or the old one's for a removed table. */
  object: string;
  /** `added` and `removed` are whole tables; `changed` has at least one difference. */
  change: "added" | "removed" | "changed";
  /** True for a removed table, and for a change with a breaking difference. */
  breaking: boolean;
  /** The differences of a changed table, as `compareSourceColumns` gives them; none otherwise. */
  differences: SourceDifference[];
}

/** Text order by code point, the same on every machine, unlike localeCompare. */
export function byCodePoint(left: string, right: string): number {
  const a = [...left].map((character) => character.codePointAt(0)!);
  const b = [...right].map((character) => character.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index++)
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  return a.length - b.length;
}

/**
 * The key two objects share when they are the same table: the object itself, or in lower case when
 * the source ignores case.
 */
export function nameKey(caseSensitive: boolean): (object: string) => string {
  return caseSensitive ? (object) => object : (object) => object.toLowerCase();
}

/** The tables by their objects' key; the first of two with the same key is kept. */
export function byObject<T extends { object: string }>(
  tables: readonly T[],
  key: (object: string) => string,
): Map<string, T> {
  const found = new Map<string, T>();
  for (const table of tables)
    if (!found.has(key(table.object))) found.set(key(table.object), table);
  return found;
}

/** An earlier table as `compareSourceColumns` takes it: its columns, and its key in order. */
function beforeOf(table: SourceTableDoc): SourceBefore {
  return {
    columns: table.columns.map((column) => ({
      name: column.name,
      logicalType: column.logicalType,
      ...(column.logicalTypeOptions && { logicalTypeOptions: column.logicalTypeOptions }),
      required: column.required,
    })),
    primaryKey: table.columns
      .filter((column) => column.primaryKeyPosition !== undefined)
      .sort((a, b) => a.primaryKeyPosition! - b.primaryKeyPosition!)
      .map((column) => column.name),
  };
}

/** A table read from a sample or an assistant's columns file is compared by its names only. */
function namesOnly(table: SourceTableDoc): boolean {
  return table.captured.from === "sample" || table.captured.from === "assistant";
}

/** The change to one table of the new document, or none when it is the same. */
function changeOf(
  old: SourceTableDoc | undefined,
  table: SourceTableDoc,
  caseSensitive: boolean,
): SourceChange | undefined {
  if (old === undefined)
    return { object: table.object, change: "added", breaking: false, differences: [] };
  const differences = compareSourceColumns(beforeOf(old), table, {
    namesOnly: namesOnly(old) || namesOnly(table),
    caseSensitive,
  });
  if (differences.length === 0) return undefined;
  const breaking = differences.some((difference) => difference.kind === "breaking");
  return { object: table.object, change: "changed", breaking, differences };
}

/** The changes from the old document's tables to the new one's, in order of `object`. */
export function sourceChanges(
  before: readonly SourceTableDoc[],
  after: readonly SourceTableDoc[],
  caseSensitive: boolean,
): SourceChange[] {
  const key = nameKey(caseSensitive);
  const earlier = byObject(before, key);
  const later = byObject(after, key);
  const changes = after.flatMap((table) => {
    const change = changeOf(earlier.get(key(table.object)), table, caseSensitive);
    return change ? [change] : [];
  });
  for (const old of before)
    if (!later.has(key(old.object)))
      changes.push({ object: old.object, change: "removed", breaking: true, differences: [] });
  return changes.sort((a, b) => byCodePoint(a.object, b.object));
}

/** Each difference's text, as the specification's table words it. */
const differenceTexts: Record<SourceCode, (difference: SourceDifference) => string> = {
  SOURCE_COLUMN_NEW: ({ column }) => `column "${column}" is new`,
  SOURCE_COLUMN_GONE: ({ column }) => `column "${column}" is gone`,
  SOURCE_TYPE_CHANGED: ({ column, before, after }) =>
    `column "${column}" is ${after}, but was ${before}`,
  SOURCE_TYPE_FITS: ({ column, before, after }) =>
    `column "${column}" is ${after}, which fits ${before}`,
  SOURCE_NULLABLE: ({ column }) => `column "${column}" was required, but can now be null`,
  SOURCE_KEY_CHANGED: ({ before, after }) => `the primary key is (${after}), but was (${before})`,
  SOURCE_TABLE_GONE: () => "removed",
};

/** Each line a change gives, with whether it is breaking. */
function changeLines(change: SourceChange): { breaking: boolean; text: string }[] {
  const line = (text: string) => `  ${change.object}: ${text}`;
  if (change.change === "added") return [{ breaking: false, text: line("added") }];
  if (change.change === "removed") return [{ breaking: true, text: line("removed") }];
  return change.differences.map((difference) => ({
    breaking: difference.kind === "breaking",
    text: line(differenceTexts[difference.code](difference)),
  }));
}

/** The first line: how many tables were added, changed and removed, or that nothing changed. */
function countLine(document: string, changes: readonly SourceChange[]): string {
  if (changes.length === 0) return `${document}: no changes.`;
  const count = (kind: SourceChange["change"]) =>
    changes.filter((change) => change.change === kind).length;
  return `${document}: ${count("added")} added, ${count("changed")} changed, ${count("removed")} removed.`;
}

/**
 * The text of an import's changes: a line counting them, then `Breaking:` and `Compatible:`,
 * each with a line for each difference (a list with no lines is left out), then each note of
 * the readers on a line of its own. Every line ends with a line break.
 * @example sourceChangesText("erp", [], []) // "sources/erp.yaml: no changes.\n"
 * @public
 */
export function sourceChangesText(
  connection: string,
  changes: readonly SourceChange[],
  notes: readonly string[],
): string {
  const lines = changes.flatMap(changeLines);
  const listed = (heading: string, breaking: boolean) => {
    const found = lines.filter((line) => line.breaking === breaking).map((line) => line.text);
    return found.length === 0 ? [] : [heading, ...found];
  };
  return [
    countLine(`sources/${connection}.yaml`, changes),
    ...listed("Breaking:", true),
    ...listed("Compatible:", false),
    ...notes,
  ]
    .map((line) => `${line}\n`)
    .join("");
}
