// Edits a new project's YAML through the yaml Document API, so comments are kept and a
// value can carry one line above it (spec/cli/projects.md, "Written defaults").
import {
  isMap,
  isScalar,
  isSeq,
  parseDocument,
  Scalar,
  type Document,
  type Pair,
  type YAMLMap,
} from "yaml";
import type { Content } from "./scaffold.js";

/** The text `init` writes where it cannot know a value. */
export const replaceMe = "REPLACE_ME";

/** A comment's longest line, `# ` included. */
const commentWidth = 100;

/** A YAML file of the new project, parsed for editing. */
export type YamlDocument = Document.Parsed;

/** The files as documents, edited by `edit`, then written back as text. */
export function editYaml(
  files: Record<string, Content>,
  path: string,
  edit: (document: YamlDocument) => void,
): void {
  const text = files[path];
  if (text === undefined) return;
  const document = parseDocument(String(text));
  edit(document);
  files[path] = document.toString({ lineWidth: 0, flowCollectionPadding: false });
}

/**
 * Sets the value at `keys`, with `comment` on the line above it, or after it when
 * `trailing`. Flow mappings on the way become block mappings, which comments need.
 */
export function setWithComment(
  document: YamlDocument,
  keys: string[],
  value: unknown,
  comment?: string,
  trailing = false,
): void {
  document.setIn(keys, value);
  // The example's quotes go with its value: a new value is written plain where it can be.
  const node = document.getIn(keys, true);
  if (isScalar(node) && typeof value === "string") node.type = "PLAIN";
  if (comment === undefined) return;
  const pair = pairAt(document, keys);
  if (!pair) return;
  const text = ` ${commentText(comment)}`;
  if (trailing && isScalar(pair.value)) pair.value.comment = text;
  else if (isScalar(pair.key)) pair.key.commentBefore = text;
}

/**
 * The pair of the last key, with every mapping on the way in block style, and its key a
 * node that can carry a comment (`setIn` adds a new key as plain text).
 */
function pairAt(document: YamlDocument, keys: string[]): Pair | undefined {
  let node: unknown = document.contents;
  let pair: Pair | undefined;
  for (const key of keys) {
    if (!isMap(node)) return undefined;
    (node as YAMLMap).flow = false;
    pair = (node as YAMLMap).items.find((item) => keyText(item.key) === key);
    if (pair && !isScalar(pair.key)) pair.key = new Scalar(pair.key);
    node = pair?.value;
  }
  return pair;
}

function keyText(key: unknown): unknown {
  return isScalar(key) ? key.value : key;
}

/** Deletes the value at `keys` when it is there; `deleteIn` throws on a missing mapping. */
export function deleteIfThere(document: YamlDocument, keys: string[]): void {
  if (document.hasIn(keys)) document.deleteIn(keys);
}

/** A trailing comment on the value at `keys`; a list or mapping is then written on one line. */
export function commentAfter(document: YamlDocument, keys: string[], comment: string): void {
  const node = document.getIn(keys, true);
  if (isSeq(node) || isMap(node)) node.flow = true;
  if (isScalar(node) || isSeq(node) || isMap(node)) node.comment = ` ${commentText(comment)}`;
}

/** Writes the list or mapping at `keys` on one line. */
export function inFlow(document: YamlDocument, keys: string[]): void {
  const node = document.getIn(keys, true);
  if (isSeq(node) || isMap(node)) node.flow = true;
}

/**
 * A description as a comment: its first sentence without the full stop, cut at a comma
 * or a word so the line, `# ` included, is at most 100 characters.
 */
export function commentText(description: string): string {
  const sentence = (description.split(/\.(\s|$)/)[0] ?? "").replace(/`/g, "").trim();
  const room = commentWidth - 2;
  if (sentence.length <= room) return sentence;
  const cut = sentence.slice(0, room);
  // What comes before a colon is the whole of what the value is; else cut at a comma or a word.
  const colon = cut.lastIndexOf(": ");
  if (colon > room / 2) return cut.slice(0, colon);
  const comma = Math.max(cut.lastIndexOf(", "), cut.lastIndexOf("; "));
  return comma > room / 2 ? cut.slice(0, comma) : cut.slice(0, cut.lastIndexOf(" "));
}

/** `REPLACE_ME` for each part of a dotted shape such as `database.schema.table`, else once. */
export function shapedPlaceholder(shape: string): string {
  return /^[A-Za-z_]+(\.[A-Za-z_]+)+$/.test(shape)
    ? shape
        .split(".")
        .map(() => replaceMe)
        .join(".")
    : replaceMe;
}
