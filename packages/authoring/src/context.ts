// What is at the cursor, worked out once for every feature: the document's
// kind and data, the keys from the root, whether a key, a value or a list item
// is being typed, and the facts of a flow's source. It tolerates text that
// does not parse, because the user is in the middle of typing.
import { parseDocument } from "yaml";
import { occurrences } from "./navigation.js";
import type { Project } from "./project.js";
import { flowPlace, lineStart } from "./flow.js";
import { itemIndex, keyPath } from "./yaml.js";

/** The place being edited in one open file. */
export interface Place {
  file: string;
  text: string;
  /** The document's `kind`, also while the text does not parse. */
  kind?: string;
  /** The document as data, as far as it parses. */
  data: Record<string, unknown>;
  /** Keys from the root to the value being typed, or to the mapping a new key goes in. */
  path: string[];
  part: "key" | "value" | "item";
  /** A value typed straight after `key:`, with no space yet. */
  tight: boolean;
  /** Inside `{ }` or `[ ]`, where only flow-style YAML is valid. */
  inFlow?: boolean;
  /** The text before the cursor. */
  before: string;
}

/** The place at `offset` in `text`, the open text of `file`. */
export function placeAt(file: string, text: string, offset: number): Place {
  const before = text.slice(0, offset);
  const line = before.slice(before.lastIndexOf("\n") + 1);
  const data = dataOf(text);
  // project.yaml has no kind; it is described as the Project kind.
  const kind = kindOf(text, data) ?? (file === "project.yaml" ? "Project" : undefined);
  const base = { file, text, data, before, tight: false, ...(kind && { kind }) };
  const path = keyPath(text, offset);
  const inFlow = flowAt(text, offset);
  if (inFlow) {
    const { outer, ...place } = inFlow;
    return { ...base, ...place, inFlow: true, path: [...(outer ?? path), ...place.path] };
  }
  const value = /^\s*(?:- )?([\w.-]+):\s*\S*$/.exec(line);
  if (value)
    return { ...base, part: "value", path: [...path, value[1]!], tight: /:\S*$/.test(line) };
  if (/^\s*-\s*\S*$/.test(line)) return { ...base, part: "item", path };
  return { ...base, part: "key", path };
}

/**
 * Inside `{ }` or `[ ]`: the keys from the line where the collection opens
 * (this line, or up to 50 lines above it), and what is typed.
 */
function flowAt(text: string, offset: number) {
  const lines = text.slice(0, offset).split("\n");
  const last = lines.length - 1;
  for (let first = last; first >= Math.max(0, last - 50); first -= 1) {
    const start = lineStart(lines[first]!);
    const flow = start && flowPlace([start.rest, ...lines.slice(first + 1)].join(" "));
    if (!start || !flow) continue;
    const own = [
      ...(start.item ? [String(itemIndex(lines, first))] : []),
      ...(start.key ? [start.key] : []),
    ];
    // The keys that lead to the line where it opens, from that line's place.
    const lineOffset = lines.slice(0, first).reduce((sum, line) => sum + line.length + 1, 0);
    const outer = first === last ? undefined : keyPath(text, lineOffset + lines[first]!.length);
    return { part: flow.part, tight: flow.tight, path: [...own, ...flow.keys], outer };
  }
  return undefined;
}

/** The keys already written in the mapping at the place's path. */
export function writtenKeys(place: Place): Set<string> {
  let node: unknown = place.data;
  for (const key of place.path) {
    if (!node || typeof node !== "object") return new Set();
    node = (node as Record<string, unknown>)[key];
  }
  return new Set(node && typeof node === "object" && !Array.isArray(node) ? Object.keys(node) : []);
}

/** A document's `kind`, also while the text does not parse. */
export function kindOf(text: string, data = dataOf(text)): string | undefined {
  return typeof data.kind === "string" ? data.kind : /^kind:\s*(\S+)/m.exec(text)?.[1];
}

/** The text as data, as far as it parses; empty when nothing does. */
function dataOf(text: string): Record<string, unknown> {
  try {
    const data: unknown = parseDocument(text).toJS();
    return data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** A flow's source, and its connection's connector and connectivity. */
export function flowFacts(
  project: Project,
  place: Place,
): { source?: string; connector?: string; connectivity?: string } {
  const source = typeof place.data.source === "string" ? place.data.source : undefined;
  const connection = source ? documentOf(project, "Connection", source) : undefined;
  const pick = (key: string) =>
    typeof connection?.[key] === "string" ? { [key]: connection[key] as string } : {};
  return { ...(source && { source }), ...pick("connector"), ...pick("connectivity") };
}

/** The ids of the project's documents of a kind, in file order. */
export function idsOf(project: Project, kind: string): string[] {
  const prefix = `doc:${kind}:`;
  const found = occurrences(project).filter(
    (item) => item.definition && item.symbol.startsWith(prefix),
  );
  return [...new Set(found.map((item) => item.symbol.slice(prefix.length)))];
}

/** The parsed document of a kind with an id (or the first one), if it parses. */
export function documentOf(
  project: Project,
  kind: string,
  id?: string,
): Record<string, unknown> | undefined {
  const symbol = `doc:${kind}:${id ?? ""}`;
  const found = occurrences(project).find(
    (item) => item.definition && (id ? item.symbol === symbol : item.symbol.startsWith(symbol)),
  );
  return found && dataOf(project.files.read(found.file) ?? "");
}
