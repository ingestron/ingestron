// Reading YAML the way the guide needs it: as the loader reads a file, without resolving anything.
import { parse, parseDocument } from "yaml";

/** A YAML mapping, with its keys in the order the file writes them. */
export type Mapping = Map<unknown, unknown>;

/** True for a YAML mapping. */
export function isMapping(value: unknown): value is Mapping {
  return value instanceof Map;
}

/** The text of a key's value when it is a string, else undefined. */
export function stringAt(mapping: Mapping, key: string): string | undefined {
  const value = mapping.get(key);
  return typeof value === "string" ? value : undefined;
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
  try {
    return { value: document.toJS({ mapAsMap: true }) as unknown };
  } catch {
    return undefined;
  }
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

/** A number as YAML flow text. */
function flowNumber(value: number): string {
  if (Number.isNaN(value)) return ".nan";
  if (!Number.isFinite(value)) return value > 0 ? ".inf" : "-.inf";
  return String(value);
}

/** A mapping as YAML flow text. */
function flowMapping(value: Mapping): string {
  if (value.size === 0) return "{}";
  const items = [...value].map(([key, item]) => `${flowString(String(key))}: ${flowText(item)}`);
  return `{ ${items.join(", ")} }`;
}

/** A value as YAML flow text on one line (spec/cli/assistants.md, section 4, "The rules"). */
export function flowText(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return flowNumber(value);
  if (typeof value === "string") return flowString(value);
  if (typeof value === "boolean" || typeof value === "bigint") return String(value);
  if (Array.isArray(value))
    return value.length === 0 ? "[]" : `[${value.map(flowText).join(", ")}]`;
  return isMapping(value) ? flowMapping(value) : JSON.stringify(String(value));
}
