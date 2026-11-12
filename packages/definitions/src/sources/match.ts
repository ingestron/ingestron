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
 * The tables by the last part of their `object`, folded as `names` says, each list in the
 * document's order. Without `names` the key is the whole `object`, with case. Made once for
 * a document, it lets `matchObject` compare only the tables that can match.
 */
export function indexTables(
  tables: SourceTableDoc[],
  names: SourceMetadataDoc["names"],
): TableIndex {
  const fold = folder(names);
  const index: TableIndex = new Map();
  for (const table of tables) {
    const key = names ? fold(lastPart(table.object)) : table.object;
    const same = index.get(key);
    if (same) same.push(table);
    else index.set(key, [table]);
  }
  return index;
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
    return index
      ? [...(index.get(object) ?? [])]
      : tables.filter((table) => table.object === object);
  const parts = partsOf(object, written);
  if (parts.length > names.parts) return [];
  const fold = folder(names);
  const last = parts[parts.length - 1];
  const candidates = index && last !== undefined ? (index.get(fold(last)) ?? []) : tables;
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
 * The flow's parts, left to right, each its resolved text, or `undefined` for a part that
 * is only a reference. When every part is only a reference, none is a wildcard: the object
 * is taken as the resolved text gives it, so a reference that is unset matches nothing. A value with a `.` in it makes the resolved text split into more
 * parts than were written: a leftmost part that is only a reference takes the extra, and
 * otherwise the resolved text is split as it stands, with nothing a wildcard.
 */
function partsOf(object: string, written: string): (string | undefined)[] {
  const asWritten = splitWritten(written);
  const resolved = object.split(".");
  if (asWritten.every((part) => onlyReference.test(part))) return resolved;
  if (asWritten.length === resolved.length)
    return asWritten.map((part, index) => (onlyReference.test(part) ? undefined : resolved[index]));
  if (asWritten.length < resolved.length && onlyReference.test(asWritten[0]!))
    return [undefined, ...resolved.slice(resolved.length - asWritten.length + 1)];
  return resolved;
}

/** The written text split on each `.` that is not inside a `${…}` reference. */
function splitWritten(written: string): string[] {
  const parts: string[] = [];
  let part = "";
  let inside = false;
  for (let at = 0; at < written.length; at++) {
    const char = written[at]!;
    if (!inside && char === "$" && written[at + 1] === "{") inside = true;
    else if (inside && char === "}") inside = false;
    if (char === "." && !inside) {
      parts.push(part);
      part = "";
    } else part += char;
  }
  return [...parts, part];
}
