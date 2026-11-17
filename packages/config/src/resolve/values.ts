// Values that refer to values (spec/config/syntax.md §4.3.1). While the manifest's values
// are resolved, `${values.…}` reads the merged values on demand: each YAML node is
// resolved once and remembered, and a reference that reaches a node still being resolved
// is a cycle.

import type { Node } from "yaml";
import { error, type Location } from "../diagnostics/index.js";
import { isRecord, mergeValues, parsePointer } from "../internal/index.js";
import type { YamlFile } from "../files/index.js";
import type { Walk } from "./scope.js";
import { resolveNode } from "./resolve.js";
import { childOf, failed, isMapping, keysOf, target, type Cursor } from "./value-cursor.js";

/** The state of resolving the manifest's values, shared by every walk inside it. */
export interface ValueState {
  /** The top-level `values`. */
  base?: Cursor;
  /** The selected environment's `values`. */
  override?: Cursor;
  /** Each node resolved so far, and its result. */
  done: Map<Node, unknown>;
  /** The nodes being resolved, outermost first, with the path each one feeds. */
  active: { node: Node; label: string }[];
}

/** The state for values written at these nodes of the manifest. */
export function valueState(file: YamlFile, base?: Node, override?: Node): ValueState {
  const at = (node: Node | undefined): Cursor | undefined =>
    node && { type: "node", node, file, pointer: "/values" };
  return { base: at(base), override: at(override), done: new Map(), active: [] };
}

/**
 * Resolves `node` once per load while values are resolved, so that its problems are reported
 * once and a value that reads it back can be found.
 */
export function resolveOnce(
  node: Node,
  pointer: string,
  state: ValueState,
  resolve: () => unknown,
): unknown {
  if (state.done.has(node)) {
    const value = state.done.get(node);
    return value === failed ? undefined : structuredClone(value);
  }
  state.active.push({ node, label: labelOf(pointer) });
  let value: unknown;
  try {
    value = resolve();
  } finally {
    state.active.pop();
  }
  state.done.set(node, value === undefined ? failed : value);
  return value === undefined ? undefined : structuredClone(value);
}

/**
 * Reads `${values.a.b}` from the merged values, resolving what it needs. Reports a problem and
 * returns `undefined` when the path does not exist or leads back to itself.
 */
export function lookupValue(
  path: readonly string[],
  source: string,
  location: Location,
  walk: Walk,
  state: ValueState,
): unknown {
  const read = (cursor: Cursor) => resolveCursor(cursor, source, location, walk, state);
  let pair: Pair = { base: state.base, override: state.override };
  for (const key of path) {
    const parents = visible(pair, read);
    if (parents === failed) return undefined;
    const base = parents.base && childOf(parents.base, key, read);
    const override = parents.override && childOf(parents.override, key, read);
    if (base === failed || override === failed) return undefined;
    if (!base && !override) {
      const hint = available([...keysOf(parents.base), ...keysOf(parents.override)]);
      const message = `"${source}" has no value: "${key}" is not defined.`;
      walk.context.diagnostics.push(error("UNKNOWN_VALUE", message, location, hint));
      return undefined;
    }
    pair = { base, override };
  }
  return merged(pair.base, pair.override, read);
}

/** The default and the environment's replacement at one path. */
interface Pair {
  base?: Cursor | undefined;
  override?: Cursor | undefined;
}

/**
 * The cursors a key is read from. Only two mappings merge, so a default that the environment
 * replaces with anything else is never read, as `mergeValues` drops it.
 */
function visible(pair: Pair, read: (cursor: Cursor) => unknown): Pair | typeof failed {
  const { base, override } = pair;
  if (!base || !override) return pair;
  for (const cursor of [override, base]) {
    const mapping = isMapping(cursor, read);
    if (mapping === failed) return failed;
    if (!mapping) return { override };
  }
  return pair;
}

/** The value of the merged cursors, as `mergeValues` would give it. */
function merged(
  base: Cursor | undefined,
  override: Cursor | undefined,
  read: (cursor: Cursor) => unknown,
): unknown {
  if (!override) return base && read(base);
  const replacement = read(override);
  if (replacement === undefined || !base || !isRecord(replacement)) return replacement;
  const earlier = read(base);
  return earlier === undefined ? undefined : mergeValues(earlier, replacement);
}

function resolveCursor(
  cursor: Cursor,
  source: string,
  location: Location,
  walk: Walk,
  state: ValueState,
): unknown {
  if (cursor.type === "data") return cursor.value;
  const node = target(cursor);
  const index = state.active.findIndex(
    (entry) => entry.node === cursor.node || entry.node === node,
  );
  if (index >= 0) {
    // A file read into a value feeds the same path as the value, so name that path once.
    const labels = state.active
      .slice(index)
      .map((entry) => entry.label)
      .filter((label, at, all) => label !== all[at - 1]);
    const chain = [...labels, labels[0]!];
    walk.context.diagnostics.push(
      error(
        "VALUE_CYCLE",
        `"${source}" makes a cycle: ${chain.join(" → ")}.`,
        location,
        "A value cannot depend on itself; remove one of the references in the chain. " +
          "An environment's value replaces the default of the same name, so it cannot build on " +
          "it: give the shared part a name of its own.",
      ),
    );
    return undefined;
  }
  return resolveNode(cursor.node, cursor.file, cursor.pointer, {
    ...walk,
    sourceMap: new Map(),
  });
}

function available(keys: string[]): string {
  const unique = [...new Set(keys)];
  return unique.length > 0
    ? `Available here: ${unique.join(", ")}.`
    : "There are no named values here.";
}

/** `/values/cluster/all` as `values.cluster.all`, the way a reference names it. */
function labelOf(pointer: string): string {
  return (parsePointer(pointer) ?? []).join(".");
}
