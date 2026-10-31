// Turns a fix into text edits that change only the values and keys it names,
// so comments and layout elsewhere stay as written (specification section 6.1).

import {
  Document,
  isMap,
  isScalar,
  isSeq,
  parseDocument,
  stringify,
  visit,
  type Pair,
  type Scalar,
  type YAMLMap,
  type YAMLSeq,
} from "yaml";
import type { Fix, FixEdit } from "./diagnostics.js";
import { parsePointer } from "./json-pointer.js";
import { removal } from "./remove-edit.js";

/** Replaces the text from offset `start` to `end` of a project file with `text`. */
export interface TextEdit {
  file: string;
  start: number;
  end: number;
  text: string;
}

/**
 * The text edits that apply a fix, given each file's current text. An edit
 * that cannot be placed, such as a value written as `${…}`, gives none.
 */
export function fixEdits(fix: Fix, read: (file: string) => string | undefined): TextEdit[] {
  return fix.edits.flatMap((edit) => {
    const text = read(edit.file);
    const change = text === undefined ? undefined : changeFor(edit, text);
    return change ? [{ file: edit.file, ...change }] : [];
  });
}

/** One file's text with edits applied; the edits were all made against `text`. */
export function applyEdits(text: string, edits: readonly Omit<TextEdit, "file">[]): string {
  return [...edits]
    .sort((a, b) => b.start - a.start)
    .reduce((out, edit) => out.slice(0, edit.start) + edit.text + out.slice(edit.end), text);
}

type Change = Omit<TextEdit, "file">;

function changeFor(edit: FixEdit, text: string): Change | undefined {
  const keys = parsePointer(edit.pointer);
  if (!keys || keys.length === 0) return undefined;
  const root = parseDocument(text).contents;
  if ("remove" in edit) return removal(root, keys, text);
  const found = walk(root, keys);
  if ("rename" in edit) {
    const key = found.rest.length === 0 ? found.pair?.key : undefined;
    return isScalar(key) ? replace(key, edit.rename, text) : undefined;
  }
  if (found.rest.length === 0)
    return isScalar(found.node)
      ? replace(found.node, edit.set, text)
      : replaceCollection(found, edit.set, text);
  return insert(found.node, found.rest, edit.set, text);
}

interface Found {
  node: unknown;
  pair?: Pair;
  rest: string[];
}

/** The deepest node that exists on the pointer's way, and the keys still missing. */
function walk(root: unknown, keys: string[]): Found {
  let found: Found = { node: root, rest: keys };
  for (const [index, key] of keys.entries()) {
    const next = childOf(found.node, key);
    if (!next) return found;
    found = { ...next, rest: keys.slice(index + 1) };
  }
  return found;
}

function childOf(node: unknown, key: string): { node: unknown; pair?: Pair } | undefined {
  if (isMap(node)) {
    const pair = node.items.find(
      (item) => String(isScalar(item.key) ? item.key.value : item.key) === key,
    );
    return pair && { node: pair.value, pair };
  }
  if (isSeq(node) && /^\d+$/.test(key)) {
    const item = node.items[Number(key)];
    return item === undefined ? undefined : { node: item };
  }
  return undefined;
}

/** A scalar's text replaced; an empty value gets a space after its colon. */
function replace(node: Scalar, value: unknown, text: string): Change | undefined {
  const [start, end] = node.range ?? [];
  if (start === undefined || end === undefined || text.slice(start, end).includes("${"))
    return undefined;
  return { start, end, text: (start === end ? " " : "") + flowText(value) };
}

/** A mapping or list after its key replaced by the value on the key's line, in flow style. */
function replaceCollection(found: Found, value: unknown, text: string): Change | undefined {
  const keyEnd = rangeEnd(found.pair?.key);
  const valueEnd = rangeEnd(found.node);
  if (keyEnd === undefined || valueEnd === undefined) return undefined;
  const colon = text.indexOf(":", keyEnd);
  const end = keyEnd + text.slice(keyEnd, valueEnd).trimEnd().length;
  return colon < 0 || colon >= end
    ? undefined
    : { start: colon + 1, end, text: ` ${flowText(value)}` };
}

function rangeEnd(node: unknown): number | undefined {
  return (node as { range?: number[] } | null | undefined)?.range?.[1];
}

/** Adds the missing keys, with the value at the end, to the deepest node that exists. */
function insert(parent: unknown, rest: string[], value: unknown, text: string): Change | undefined {
  if (isScalar(parent) && parent.value === null) return replace(parent, nested(rest, value), text);
  if (parent === null || parent === undefined) return block(undefined, nested(rest, value), text);
  const [first, ...more] = rest;
  if (isSeq(parent) !== (first === "-") || !(isMap(parent) || isSeq(parent))) return undefined;
  const item = isSeq(parent) ? [nested(more, value)] : { [first!]: nested(more, value) };
  return parent.flow ? flow(parent, item, text) : block(parent, item, text);
}

function nested(keys: string[], value: unknown): unknown {
  return keys.reduceRight<unknown>(
    (inner, key) => (key === "-" ? [inner] : { [key]: inner }),
    value,
  );
}

/** Before the closing bracket, after the last entry. */
function flow(collection: YAMLMap | YAMLSeq, item: unknown, text: string): Change {
  const [open = 0, after = 0] = collection.range ?? [];
  let at = after - 1;
  while (at > open + 1 && /\s/.test(text[at - 1] ?? "")) at -= 1;
  const inner = flowText(item).slice(1, -1).trim();
  return { start: at, end: at, text: (collection.items.length > 0 ? ", " : "") + inner };
}

/** On new lines after the collection, at its indentation. */
function block(collection: YAMLMap | YAMLSeq | undefined, item: unknown, text: string): Change {
  const [start = 0, end = text.length] = collection?.range ?? [];
  const indent = " ".repeat(start - (text.lastIndexOf("\n", start - 1) + 1));
  const lines = stringify(item, { lineWidth: 0 }).replace(/^(?=.)/gm, indent);
  return { start: end, end, text: (end > 0 && text[end - 1] !== "\n" ? "\n" : "") + lines };
}

/** A value as YAML on one line: collections in flow style, text quoted only when needed. */
function flowText(value: unknown): string {
  const document = new Document(value);
  visit(document, {
    Map: (_, node) => {
      node.flow = true;
    },
    Seq: (_, node) => {
      node.flow = true;
    },
  });
  // A list on its own is written [a, b], as lists inside mappings are.
  return document
    .toString({ lineWidth: 0 })
    .trimEnd()
    .replace(/^\[ (.*) \]$/s, "[$1]");
}
