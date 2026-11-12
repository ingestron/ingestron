// Matching a flow table's object with the tables of its connection's source metadata
// (specification section 12.3).
import type { SourceMetadataDoc, SourceTableDoc } from "../documents/index.js";

/** A part that is exactly one `${…}` reference: it matches anything. */
const onlyReference = /^\$\{[^}]*\}$/;

/**
 * True for an object written only as references: one `${…}`, or several joined by a `.` that
 * is outside any reference, such as `${values.schema}.${envvar:TABLE}`. A part with text as
 * well, such as `dbo.${envvar:TABLE}` or `${a}${b}`, is not.
 */
export function onlyReferences(text: string): boolean {
  return splitWritten(text).every((part) => onlyReference.test(part));
}

/** A document's tables by the last part of their `object` (the whole object without `names`). */
export type TableIndex = Map<string, SourceTableDoc[]>;

/** How a name's parts are compared: as written, or with case ignored. */
function folder(names: SourceMetadataDoc["names"]): (text: string) => string {
  return !names || names.caseSensitive ? (text) => text : (text) => text.toLowerCase();
}

/** The last part of an object, `parts` of them or not: the part every flow object must match. */
function lastPart(object: string): string {
  return object.slice(object.lastIndexOf(".") + 1);
}

/**
 * An object's key in a `TableIndex`, for a metadata table's object and a flow's alike: its last
 * part folded as `names` says, or without `names` the whole object, with case.
 */
function indexKey(object: string, names: SourceMetadataDoc["names"]): string {
  return names ? folder(names)(lastPart(object)) : object;
}

/**
 * The tables by `indexKey` of their `object`, each list in the document's order. Made once for
 * a document, it lets `matchObject` compare only the tables that can match.
 */
export function indexTables(
  tables: SourceTableDoc[],
  names: SourceMetadataDoc["names"],
): TableIndex {
  const index: TableIndex = new Map();
  for (const table of tables) {
    const key = indexKey(table.object, names);
    const same = index.get(key);
    if (same) same.push(table);
    else index.set(key, [table]);
  }
  return index;
}

/**
 * The tables that can match a flow's object whose last part, or whole text without `names`, is
 * `text`: those the index lists under its key, or every table when there is no index or the last
 * part is a reference (`text` undefined), which matches any table. The caller still compares
 * their `object`. This and `indexKey` are the one place that decides what the index holds.
 */
function candidatesFor(
  tables: SourceTableDoc[],
  names: SourceMetadataDoc["names"],
  index: TableIndex | undefined,
  text: string | undefined,
): SourceTableDoc[] {
  if (!index || text === undefined) return tables;
  return index.get(indexKey(text, names)) ?? [];
}

/**
 * Every table whose `object` the flow's object matches, in the order given. `object` is the
 * resolved text and `written` the same text as written, before any reference was replaced,
 * which says which parts are references. Without `names` the text must be equal. With
 * them, the parts split on `.` are compared from the right: a part that is only a
 * reference matches anything, a part the flow leaves out matches anything, and an object
 * with more parts than `names.parts` matches nothing. With `index`, made by `indexTables`
 * for these tables and names, only the tables whose last part equals the flow's are compared,
 * unless the flow's last part is a reference, which matches every table: the result is the
 * same as without it.
 */
export function matchObject(
  object: string,
  written: string,
  tables: SourceTableDoc[],
  names: SourceMetadataDoc["names"],
  index?: TableIndex,
): SourceTableDoc[] {
  if (!names)
    return candidatesFor(tables, names, index, object).filter((table) => table.object === object);
  const parts = partsOf(object, written);
  if (!parts || parts.length > names.parts) return [];
  const fold = folder(names);
  // A last part that is not a reference is the flow's last part as resolved, so the flow's
  // object has the key its matches have.
  const candidates = candidatesFor(tables, names, index, parts[parts.length - 1]);
  return candidates.filter((table) => {
    const theirs = table.object.split(".");
    return (
      parts.length <= theirs.length &&
      parts.every((part, at) => {
        const other = theirs[theirs.length - parts.length + at]!;
        return part === undefined || fold(part) === fold(other);
      })
    );
  });
}

/**
 * The flow's parts, left to right, each its resolved text, or `undefined` for a part that is
 * only a reference, which matches anything. None when the resolved text cannot be those parts.
 *
 * A value put in a part by a reference is not split again, so each written part is one part
 * however many dots its value holds (specification section 12.3). The resolved text is read
 * with a pattern made from the written parts: a part that is only a reference takes any text,
 * dots included, and a part with text takes none, so a dotted value in a part that mixes text
 * and a reference gives no parts, and matches nothing.
 *
 * When every part is only a reference, none is a wildcard: the object is the resolved text
 * split as it stands, so a variable that holds the whole object matches its value, and one that
 * is unset matches nothing. With no reference to see (`written` is the resolved text, as when
 * the flow's file could not give it) every part is compared as it stands.
 */
function partsOf(object: string, written: string): (string | undefined)[] | undefined {
  const asWritten = splitWritten(written);
  if (asWritten.every((part) => onlyReference.test(part))) return object.split(".");
  const found = new RegExp(`^${asWritten.map(patternOf).join("\\.")}$`, "s").exec(object);
  if (!found) return undefined;
  return asWritten.map((part, at) => (onlyReference.test(part) ? undefined : found[at + 1]!));
}

/** The pattern for one written part, with one group: the part's text in the resolved object. */
function patternOf(part: string): string {
  if (onlyReference.test(part)) return "(.*)";
  const text: string[] = [];
  let at = 0;
  while (at < part.length) {
    if (part.startsWith("$${", at)) {
      text.push("\\$\\{");
      at += 3;
    } else if (part.startsWith("${", at)) {
      text.push("[^.]*");
      at = referenceEnd(part, at);
    } else {
      text.push(part[at]!.replace(/[\\^$.*+?()[\]{}|/-]/, "\\$&"));
      at += 1;
    }
  }
  return `(${text.join("")})`;
}

/** Where the `${…}` that starts at `start` ends: after its `}`, or at the end of the text. */
function referenceEnd(text: string, start: number): number {
  const close = text.indexOf("}", start + 2);
  return close < 0 ? text.length : close + 1;
}

/**
 * The written text split on each `.` that is not inside a `${…}` reference. A `$${` is the
 * text `${`, as the references of the configuration read it, so it starts no reference.
 */
function splitWritten(written: string): string[] {
  const parts: string[] = [];
  let part = "";
  let at = 0;
  while (at < written.length) {
    let end = at + 1;
    if (written.startsWith("$${", at)) end = at + 3;
    else if (written.startsWith("${", at)) end = referenceEnd(written, at);
    if (written[at] === "." && end === at + 1) {
      parts.push(part);
      part = "";
    } else part += written.slice(at, end);
    at = end;
  }
  return [...parts, part];
}
