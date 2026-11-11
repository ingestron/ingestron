// Matching a flow table's object with the tables of its connection's source metadata
// (specification section 12.3).
import type { SourceMetadataDoc, SourceTableDoc } from "../documents/index.js";

/** A part that is exactly one `${…}` reference: it matches anything. */
const onlyReference = /^\$\{[^}]*\}$/;

/** True for text that is exactly one `${…}` reference. */
export function isReference(text: string): boolean {
  return onlyReference.test(text);
}

/**
 * Every table whose `object` the flow's object matches, in the order given. `object` is the
 * resolved text and `written` the same text as written, before any reference was replaced,
 * which says which parts are references. Without `names` the text must be equal. With
 * them, the parts split on `.` are compared from the right: a part that is only a
 * reference matches anything, a part the flow leaves out matches anything, and an object
 * with more parts than `names.parts` matches nothing.
 */
export function matchObject(
  object: string,
  written: string,
  tables: SourceTableDoc[],
  names: SourceMetadataDoc["names"],
): SourceTableDoc[] {
  if (!names) return tables.filter((table) => table.object === object);
  const parts = partsOf(object, written);
  if (parts.length > names.parts) return [];
  const same = names.caseSensitive
    ? (left: string, right: string) => left === right
    : (left: string, right: string) => left.toLowerCase() === right.toLowerCase();
  return tables.filter((table) => {
    const theirs = table.object.split(".");
    return (
      parts.length <= theirs.length &&
      parts.every((part, index) => {
        const other = theirs[theirs.length - parts.length + index]!;
        return part === undefined || same(part, other);
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
