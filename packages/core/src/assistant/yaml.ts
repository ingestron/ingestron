// Reading YAML the way the guide needs it: as the loader reads a file, without resolving anything.
import { parse, parseDocument, visit } from "yaml";

/** A YAML mapping, with its keys in the order the file writes them. */
export type Mapping = Map<unknown, unknown>;

/** True for a YAML mapping. */
export function isMapping(value: unknown): value is Mapping {
  return value instanceof Map;
}

/** A number whose text in the file differs from the one a number prints as (`1.50`, `1e3`, `0x1F`). */
export class WrittenNumber {
  constructor(readonly text: string) {}
}

/** The text of a key's value when it is a string, else undefined. */
export function stringAt(mapping: Mapping, key: string): string | undefined {
  const value = mapping.get(key);
  return typeof value === "string" ? value : undefined;
}

/** A key's value when it is a string or a number (a version may be written either way), as text. */
export function scalarAt(mapping: Mapping, key: string): string | undefined {
  const value = mapping.get(key);
  if (value instanceof WrittenNumber) return value.text;
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

/** The strings of a key's value when it is a list, else an empty list. */
export function stringsAt(mapping: Mapping, key: string): string[] {
  const value = mapping.get(key);
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/**
 * The value of a file's one YAML document, with mappings as maps. `undefined` when the text does
 * not parse (the loader's rules: one document, unique keys); a document of nothing is `null`.
 */
export function readYaml(text: string): { value: unknown } | undefined {
  const document = parseDocument(text, { uniqueKeys: true });
  if (document.errors.length > 0) return undefined;
  keepNumberText(document);
  try {
    return { value: document.toJS({ mapAsMap: true }) as unknown };
  } catch {
    return undefined;
  }
}

/** Replaces each number whose text differs from what it prints as with the text the file wrote. */
function keepNumberText(document: ReturnType<typeof parseDocument>): void {
  visit(document, {
    Scalar(_key, node) {
      if (
        typeof node.value === "number" &&
        node.source !== undefined &&
        node.source !== String(node.value)
      )
        node.value = new WrittenNumber(node.source);
    },
  });
}

const bare = /^[A-Za-z0-9][A-Za-z0-9_./@:-]*$/;

/** A string as YAML flow text: bare when that reads back as the same string, else a JSON string. */
function flowString(text: string): string {
  if (bare.test(text)) {
    try {
      if (parse(text) === text) return text;
    } catch {
      // Quoted below.
    }
  }
  return JSON.stringify(text);
}

/** A number as YAML flow text, for one that did not come from a file's text. */
function flowNumber(value: number): string {
  if (Number.isNaN(value)) return ".nan";
  if (!Number.isFinite(value)) return value > 0 ? ".inf" : "-.inf";
  return String(value);
}

/** A mapping as YAML flow text. */
function flowMapping(value: Mapping): string {
  if (value.size === 0) return "{}";
  const items = [...value].map(([key, item]) => `${flowText(key)}: ${flowText(item)}`);
  return `{ ${items.join(", ")} }`;
}

/** A scalar, or anything else that is not a list or a mapping, as YAML flow text. */
function flowScalar(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (value instanceof WrittenNumber) return value.text;
  if (typeof value === "number") return flowNumber(value);
  if (typeof value === "string") return flowString(value);
  if (typeof value === "boolean" || typeof value === "bigint") return String(value);
  return JSON.stringify(String(value));
}

/** A mapping key as text: a string as it is, anything else as YAML flow text (`1.0`, `0x10`). */
export function keyText(key: unknown): string {
  return typeof key === "string" ? key : flowText(key);
}

/** A value as YAML flow text on one line (spec/cli/assistants.md, section 4, "The rules"). */
export function flowText(value: unknown): string {
  if (Array.isArray(value))
    return value.length === 0 ? "[]" : `[${value.map(flowText).join(", ")}]`;
  return isMapping(value) ? flowMapping(value) : flowScalar(value);
}
