// What is typed at the cursor, for completion of a name or a value: where it starts, so that a
// suggestion replaces all of it, and the quote it opens with, if any.
import type { Place } from "../navigation/index.js";
import type { Quote } from "./column-text.js";

/**
 * The offset where the value typed so far starts, after any opening quote: all of it after the
 * key, spaces included, or after the dash of a list item.
 */
export function valueStart(place: Place): number {
  return place.before.length - typedAt(place).replace(/^["']/, "").length;
}

/**
 * What is typed at the cursor for the name or value being written: after the key, the dash or,
 * in flow style, the last `[`, `{`, `,` or `:`; for a new key the whole line. A value may hold a
 * space, such as `object: Order D`.
 */
function typedAt({ before, part, inFlow }: Place): string {
  const line = before.slice(before.lastIndexOf("\n") + 1);
  if (inFlow)
    return line
      .slice(Math.max(...[..."[{,:"].map((mark) => line.lastIndexOf(mark))) + 1)
      .trimStart();
  if (part === "item") return /^\s*-\s*(.*)$/.exec(line)?.[1] ?? "";
  if (part === "key") return line.trimStart();
  return /^\s*(?:-\s+)?[\w.-]+:\s*(.*)$/.exec(line)?.[1] ?? "";
}

/** The quote that opens the text typed at the cursor, if any. */
export function quoteAt(place: Place): Quote {
  const [first] = typedAt(place);
  return first === '"' || first === "'" ? first : "";
}
