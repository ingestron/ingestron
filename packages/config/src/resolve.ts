// Turns a YAML node into plain data, resolving every `${…}` inside it.
//
// Convention used by every resolve function: `undefined` means "failed, and a
// diagnostic has already been reported". YAML never produces `undefined`
// itself (an empty value is `null`).

import {
  isAlias,
  isMap,
  isNode,
  isScalar,
  isSeq,
  type Alias,
  type Node,
  type YAMLMap,
  type YAMLSeq,
} from "yaml";
import { isSafeKey, type DataRecord } from "./data.js";
import { error } from "./diagnostics.js";
import { appendPointer } from "./json-pointer.js";
import { resolveString } from "./resolve-string.js";
import type { Walk } from "./scope.js";
import { locationOf, type YamlFile } from "./yaml-file.js";

/**
 * Resolves a node and everything inside it. `pointer` is where the result
 * will sit in the final document; it is recorded in `walk.sourceMap` so that
 * later errors can point back to this file and line.
 */
export function resolveNode(
  node: Node | null | undefined,
  file: YamlFile,
  pointer: string,
  walk: Walk,
): unknown {
  if (!node) return null;
  walk.sourceMap.set(pointer, locationOf(file, node));
  if (isAlias(node)) return resolveAlias(node, file, pointer, walk);
  if (isMap(node)) return resolveMap(node, file, pointer, walk);
  if (isSeq(node)) return resolveSeq(node, file, pointer, walk);
  if (!isScalar(node)) return null;
  if (typeof node.value !== "string") return node.value;
  return resolveString(node.value, locationOf(file, node), file, pointer, walk);
}

function resolveMap(node: YAMLMap, file: YamlFile, pointer: string, walk: Walk): DataRecord {
  const result: DataRecord = {};
  for (const pair of node.items) {
    const key = keyText(pair.key, file, walk);
    if (key === undefined) continue;
    if (Object.hasOwn(result, key)) {
      reportDuplicateKey(key, pair.key, file, walk);
      continue;
    }
    const value = isNode(pair.value) ? pair.value : null;
    result[key] = resolveNode(value, file, appendPointer(pointer, key), walk);
  }
  return result;
}

function resolveSeq(node: YAMLSeq, file: YamlFile, pointer: string, walk: Walk): unknown[] {
  return node.items.map((item, index) =>
    resolveNode(isNode(item) ? item : null, file, appendPointer(pointer, index), walk),
  );
}

/** YAML treats `1` and `'1'` as different keys; as text they are the same key. */
function reportDuplicateKey(key: string, keyNode: unknown, file: YamlFile, walk: Walk): void {
  walk.context.diagnostics.push(
    error(
      "YAML_SYNTAX",
      `Duplicate key "${key}". Keys are compared as text, so 1 and '1' are the same key.`,
      locationOf(file, isNode(keyNode) ? keyNode : undefined),
      "Remove or rename one of the keys.",
    ),
  );
}

/** Keys are taken literally (never interpolated) and must be safe text. */
function keyText(key: unknown, file: YamlFile, walk: Walk): string | undefined {
  const text = isScalar(key) ? String(key.value) : undefined;
  if (text !== undefined && isSafeKey(text)) return text;
  walk.context.diagnostics.push(
    error(
      "UNSAFE_KEY",
      `The key ${text === undefined ? "here" : `"${text}"`} is not allowed.`,
      locationOf(file, isNode(key) ? key : undefined),
      "Keys must be plain text other than __proto__, constructor or prototype.",
    ),
  );
  return undefined;
}

function resolveAlias(node: Alias, file: YamlFile, pointer: string, walk: Walk): unknown {
  walk.context.aliasCount += 1;
  if (walk.context.aliasCount > walk.context.limits.maxAliases) {
    walk.context.diagnostics.push(
      error(
        "ALIAS_LIMIT",
        `More than ${walk.context.limits.maxAliases} YAML aliases were expanded.`,
        locationOf(file, node),
        "Use fewer aliases, or raise limits.maxAliases.",
      ),
    );
    return undefined;
  }
  const target = node.resolve(file.document);
  return resolveNode(target ?? null, file, pointer, walk);
}
