// Where in a filter's SQL text each `{{ parameters.<name> }}` stands (specification section 5.1).
// A pack puts a parameter's value in as a SQL value, so a reference must stand in plain SQL code:
// inside a quoted text, a quoted name or a comment the value would be read as SQL itself.

/** What the walk found: names referred to inside quotes or comments, and whether a brace is stray. */
export interface FilterScan {
  /** The names referred to inside quoted text, a quoted name or a comment, once each. */
  quoted: string[];
  /** True when the text holds `@{`, or a `{` or `}` that is not a reference's own. */
  stray: boolean;
  /**
   * True when the parentheses in plain SQL code do not balance: a `)` closes no `(` before it,
   * or a `(` is never closed. Absent when they balance.
   */
  unbalanced?: true;
}

/** How a character in plain code changes the depth of parentheses. */
const depthStep = (char: string | undefined): number => (char === "(" ? 1 : char === ")" ? -1 : 0);

const reference = /\{\{\s*parameters\.([A-Za-z0-9_]+)\s*\}\}/y;

/** How each quoting form ends: its closing text, and whether the closing text doubled stays inside. */
const forms: Record<string, { close: string; doubled: boolean }> = {
  "'": { close: "'", doubled: true },
  '"': { close: '"', doubled: true },
  "[": { close: "]", doubled: true },
  "--": { close: "\n", doubled: false },
};

/** The form that opens at `at` in the text, if any. */
const opening = (text: string, at: number): string | undefined =>
  ["--", "/*", "'", '"', "["].find((open) => text.startsWith(open, at));

/**
 * Where a block comment that opened just before `from` ends. SQL Server nests them: a `/*` inside
 * one opens another, and quotes and `--` inside are plain text, so it ends only when every one is
 * closed. An unclosed comment runs to the end of the text.
 */
function blockEnd(text: string, from: number): number {
  let depth = 1;
  for (let at = from; at < text.length;) {
    const step = text.startsWith("/*", at) ? 1 : text.startsWith("*/", at) ? -1 : 0;
    depth += step;
    at += step === 0 ? 1 : 2;
    if (depth === 0) return at;
  }
  return text.length;
}

/** Where the text of a form that opened at `from` ends: just after its closing text, or the text's end. */
function closing(text: string, from: number, open: string): number {
  if (open === "/*") return blockEnd(text, from);
  const { close, doubled } = forms[open]!;
  let at = from;
  while (at < text.length) {
    const found = text.indexOf(close, at);
    if (found < 0) return text.length;
    if (doubled && text.startsWith(close, found + close.length)) at = found + 2 * close.length;
    else return found + close.length;
  }
  return text.length;
}

/** Where the walk of a filter has got to. */
interface Walk {
  quoted: Set<string>;
  stray: boolean;
  /** The part of the text read as quoted ends here; before it, references are inside it. */
  until: number;
  /** The depth of parentheses in plain code; below zero once a `)` closes nothing. */
  depth: number;
}

/** Reads the reference, form or character at `at`, and returns where the next one starts. */
function step(text: string, at: number, walk: Walk): number {
  reference.lastIndex = at;
  const found = reference.exec(text);
  if (found) {
    if (at < walk.until) walk.quoted.add(found[1]!);
    return at + found[0].length;
  }
  if ("{}".includes(text.charAt(at))) walk.stray = true;
  const open = at < walk.until ? undefined : opening(text, at);
  if (open) walk.until = closing(text, at + open.length, open);
  else if (at >= walk.until && walk.depth >= 0) walk.depth += depthStep(text[at]);
  return at + (open?.length ?? 1);
}

/**
 * Walks the filter with SQL Server's rules: a doubled quote stays inside a string or a quoted name,
 * `]]` stays inside brackets, a line comment runs to the end of the line, and a block comment nests,
 * ending only when every `/*` in it is closed. Reports each reference inside one of those, and any brace that is not a
 * reference's own, wherever it stands, and whether the parentheses in plain code balance.
 */
export function scanFilter(text: string): FilterScan {
  const walk: Walk = { quoted: new Set<string>(), stray: false, until: 0, depth: 0 };
  for (let at = 0; at < text.length;) at = step(text, at, walk);
  const { quoted, stray, depth } = walk;
  return { quoted: [...quoted], stray, ...(depth !== 0 && { unbalanced: true as const }) };
}
