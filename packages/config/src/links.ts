// Checks fields that name another document, as declared in a kind's `links`.

import { isRecord } from "./data.js";
import { error, type Diagnostic, type Fix } from "./diagnostics.js";
import { nearNames } from "./distance.js";
import { appendPointer, parsePointer } from "./json-pointer.js";
import type { LoadedDocument } from "./documents.js";
import { locateIn } from "./validate.js";

/**
 * Reports every link whose value is not the id of a document of the target
 * kind. Documents that failed their schema are targets but not sources. A
 * link to a document that could not be loaded is not reported: that
 * document's own problem already is.
 */
export function checkLinks(
  loaded: readonly LoadedDocument[],
  diagnostics: Diagnostic[],
  unloaded: readonly { kind?: string; id: string }[] = [],
): void {
  for (const source of loaded.filter(({ valid }) => valid)) {
    for (const [pattern, targetKind] of Object.entries(source.definition.links)) {
      const skipped = unloaded
        .filter(({ kind }) => kind === undefined || kind === targetKind)
        .map(({ id }) => id);
      const ids = [...idsOfKind(loaded, targetKind), ...skipped];
      checkPattern(source, pattern, ids, idsOfKind(loaded, targetKind), targetKind, diagnostics);
    }
  }
}

function checkPattern(
  { document, sourceMap }: LoadedDocument,
  pattern: string,
  accepted: readonly string[],
  ids: readonly string[],
  targetKind: string,
  diagnostics: Diagnostic[],
): void {
  for (const link of valuesAt(document.value, parsePointer(pattern) ?? [], "")) {
    if (typeof link.value === "string" && accepted.includes(link.value)) continue;
    const location = locateIn(sourceMap)(link.pointer);
    const problem = error(
      "BROKEN_LINK",
      `${JSON.stringify(link.value)} is not the id of a ${targetKind} document.`,
      location,
      ids.length > 0
        ? `Known ${targetKind} ids: ${ids.join(", ")}.`
        : `There are no ${targetKind} documents.`,
    );
    const fixes = location?.file === document.file ? linkFixes(link, document.file, ids) : [];
    diagnostics.push(fixes.length > 0 ? { ...problem, fixes } : problem);
  }
}

/** The ids at most two edits from the link's value, nearest first. */
function linkFixes(link: FoundValue, file: string, ids: readonly string[]): Fix[] {
  return nearNames(String(link.value), ids).map((id) => ({
    title: `Change to "${id}"`,
    edits: [{ file, pointer: link.pointer, set: id }],
  }));
}

function idsOfKind(loaded: readonly LoadedDocument[], kind: string): string[] {
  return loaded.filter(({ document }) => document.kind === kind).map(({ document }) => document.id);
}

interface FoundValue {
  pointer: string;
  value: unknown;
}

/** Every value at a pointer pattern; `*` matches any key or list index. */
function valuesAt(value: unknown, keys: readonly string[], pointer: string): FoundValue[] {
  const [key, ...rest] = keys;
  if (key === undefined) return [{ pointer, value }];
  return childrenOf(value, key).flatMap(([childKey, child]) =>
    valuesAt(child, rest, appendPointer(pointer, childKey)),
  );
}

function childrenOf(value: unknown, key: string): [string, unknown][] {
  if (Array.isArray(value)) {
    const entries = value.map((child, index): [string, unknown] => [String(index), child]);
    return key === "*" ? entries : entries.filter(([index]) => index === key);
  }
  if (!isRecord(value)) return [];
  if (key === "*") return Object.entries(value);
  return Object.hasOwn(value, key) ? [[key, value[key]]] : [];
}
