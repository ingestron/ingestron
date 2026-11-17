// Cursors into the manifest's values while they are resolved (spec/config/syntax.md §4.3.1):
// steps through written YAML without resolving it, and resolves a value only when a step
// needs what it holds.

import { isAlias, isMap, isNode, isScalar, isSeq, type Node, type YAMLMap } from "yaml";
import { appendPointer, isRecord, isSafeKey } from "../internal/index.js";
import type { YamlFile } from "../files/index.js";

/** A value not resolved yet, written in a file, or one already resolved. */
export type Cursor = NodeCursor | { type: "data"; value: unknown };

/** A value written in a file and not resolved yet. */
export type NodeCursor = { type: "node"; node: Node; file: YamlFile; pointer: string };

/** Returned when a value could not be read; its problem is already reported. */
export const failed = Symbol("failed");

/** True when the cursor holds a mapping; a scalar is resolved to find out. */
export function isMapping(
  cursor: Cursor,
  read: (cursor: Cursor) => unknown,
): boolean | typeof failed {
  if (cursor.type === "data") return isRecord(cursor.value);
  const node = target(cursor);
  if (isMap(node)) return true;
  if (isSeq(node) || !isScalar(node) || typeof node.value !== "string") return false;
  const value = read(cursor);
  return value === undefined ? failed : isRecord(value);
}

/** The child at `key`, `undefined` when there is none, or `failed` when it could not be read. */
export function childOf(
  cursor: Cursor,
  key: string,
  read: (cursor: Cursor) => unknown,
): Cursor | undefined | typeof failed {
  if (cursor.type === "data") return dataChild(cursor.value, key);
  const node = target(cursor);
  if (isMap(node)) return mapChild(cursor, node, key);
  if (isSeq(node))
    return isIndex(key) ? nodeCursor(cursor, key, node.items[Number(key)]) : undefined;
  if (!isScalar(node) || typeof node.value !== "string") return undefined;
  const value = read(cursor);
  return value === undefined ? failed : dataChild(value, key);
}

/** The entry at `key` of a mapping, compared as text; an empty entry is null. */
function mapChild(cursor: NodeCursor, node: YAMLMap, key: string): Cursor | undefined {
  const pair = isSafeKey(key)
    ? node.items.find((item) => isScalar(item.key) && String(item.key.value) === key)
    : undefined;
  return pair && (nodeCursor(cursor, key, pair.value) ?? { type: "data", value: null });
}

/** The cursor for a child node written under `parent`. */
function nodeCursor(parent: NodeCursor, key: string, child: unknown): Cursor | undefined {
  if (!isNode(child)) return undefined;
  return {
    type: "node",
    node: child,
    file: parent.file,
    pointer: appendPointer(parent.pointer, key),
  };
}

/** The child of resolved data at a mapping key or list index. */
function dataChild(value: unknown, key: string): Cursor | undefined {
  if (Array.isArray(value))
    return isIndex(key) && Number(key) < value.length
      ? { type: "data", value: value[Number(key)] }
      : undefined;
  return isRecord(value) && isSafeKey(key) && Object.hasOwn(value, key)
    ? { type: "data", value: value[key] }
    : undefined;
}

/** The names at a cursor, without resolving anything. */
export function keysOf(cursor: Cursor | undefined): string[] {
  if (!cursor) return [];
  if (cursor.type === "data") return isRecord(cursor.value) ? Object.keys(cursor.value) : [];
  const node = target(cursor);
  return isMap(node)
    ? node.items.flatMap((item) => (isScalar(item.key) ? [String(item.key.value)] : []))
    : [];
}

/** The node an alias stands for, or the node itself. */
export function target(cursor: NodeCursor): Node | undefined {
  const { node } = cursor;
  if (!isAlias(node)) return node;
  const resolved = node.resolve(cursor.file.document);
  return isNode(resolved) ? resolved : undefined;
}

const isIndex = (key: string) => /^(0|[1-9]\d*)$/.test(key);
