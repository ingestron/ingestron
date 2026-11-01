// A transform's query against its contract (specification section 5,
// "Transform columns"): the columns its outermost SELECT names.
import type { DefinitionDocument } from "@ingestron/config";
import type { Context } from "./context.js";
import type { Contract } from "./model.js";

/**
 * The column names the outermost SELECT returns, or undefined when the code is
 * not SQL or a column has no name to read (`*`, an expression without `AS`).
 * @example selectedColumns("SELECT a.id, count(*) AS n FROM t") // ["id", "n"]
 */
export function selectedColumns(code: string): string[] | undefined {
  const masked = masking(code);
  if (!/^\s*(select|with)\b/i.test(masked)) return undefined;
  const select = topLevel(masked, /\bselect\b/gi);
  if (select === undefined) return undefined;
  const from = topLevel(masked, /\bfrom\b/gi, select + 6) ?? masked.length;
  // Names in "quotes" survive masking; only comments and text in '…' are blanked.
  const list = masked.slice(select + 6, from).replace(/^\s*(distinct|all)\b/i, "");
  const items = splitTopLevel(list);
  const names = items.map(columnName);
  return names.every((name): name is string => name !== undefined) ? names : undefined;
}

/** TRANSFORM_COLUMNS warnings for columns the query and the contract do not share. */
export function checkTransformColumns(
  context: Context,
  doc: DefinitionDocument,
  contract: Contract,
  code: string,
): void {
  const returned = selectedColumns(code);
  if (!returned) return;
  const key = (name: string) => name.toLowerCase();
  const kept = new Set(contract.columns.map((column) => key(column.name)));
  const given = new Set(returned.map(key));
  const at = { document: doc, pointer: "/code" };
  for (const name of returned.filter((item) => !kept.has(key(item))))
    context.reporter.warning(
      "TRANSFORM_COLUMNS",
      `"${name}" is returned, but the contract ${contract.id} does not name it.`,
      at,
    );
  for (const column of contract.columns.filter((item) => !given.has(key(item.name))))
    context.reporter.warning(
      "TRANSFORM_COLUMNS",
      `The query returns no column "${column.name}", which the contract ${contract.id} names.`,
      at,
    );
}

/** The code with comments blanked and the text of '…' replaced, at the same positions. */
function masking(code: string): string {
  return code
    .replace(/--[^\n]*/g, (comment) => " ".repeat(comment.length))
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    .replace(/'(?:[^']|'')*'/g, (text) => `'${"x".repeat(text.length - 2)}'`);
}

/** The first match of `word` outside parentheses, from `start`. */
function topLevel(masked: string, word: RegExp, start = 0): number | undefined {
  for (const match of masked.matchAll(word)) {
    if (match.index < start) continue;
    if (depthAt(masked, match.index) === 0) return match.index;
  }
  return undefined;
}

function depthAt(masked: string, index: number): number {
  let depth = 0;
  for (const char of masked.slice(0, index)) depth += char === "(" ? 1 : char === ")" ? -1 : 0;
  return depth;
}

/** Masked text split at commas outside parentheses. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  [...text].forEach((char, index) => {
    depth += char === "(" ? 1 : char === ")" ? -1 : 0;
    if (char === "," && depth === 0) {
      parts.push(text.slice(from, index));
      from = index + 1;
    }
  });
  return [...parts, text.slice(from)].map((part) => part.trim()).filter(Boolean);
}

const name = String.raw`("[^"]+"|[A-Za-z_][\w$]*)`;
const unquote = (written: string) => written.replace(/^"(.*)"$/, "$1");

/** An item's column name: its alias, or its last name part; undefined for `*` or an unnamed expression. */
function columnName(item: string): string | undefined {
  const alias = new RegExp(`\\bAS\\s+${name}$`, "i").exec(item);
  if (alias) return unquote(alias[1]!);
  // A name, or a path such as t."Line.No": the last part, read whole even when quoted with dots.
  const path = new RegExp(`^(?:${name}\\.)*${name}$`).exec(item);
  if (path) return unquote(path[path.length - 1]!);
  const bare = new RegExp(`\\)\\s+${name}$`).exec(item);
  return bare ? unquote(bare[1]!) : undefined;
}
