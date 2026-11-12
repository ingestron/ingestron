// How the import writes one value in YAML (spec/cli/sources.md, section 3, "The document"): plain
// when YAML reads it back as the same value, else in double quotes; lists and mappings in flow
// style, on one line.
import { parseDocument } from "yaml";
import { isRecord } from "./records.js";

/** Where a value is written: after `key: ` in a block mapping, or inside `{ … }` or `[ … ]`. */
export type YamlPlace = "block" | "flow";

/**
 * Text that is plain in every place, unless a YAML tool reads it as another value: it starts with
 * a letter, so it is not a number, and holds no space, `,`, `:`, `#` or bracket of a flow list.
 */
const simple = /^[A-Za-z_][A-Za-z0-9_.()/-]*$/;
const keywords = /^(true|false|null|yes|no|on|off|y|n)$/i;

/** Characters YAML does not allow as they are in a double-quoted value. */
const unprintable = /[\u007f-\u0084\u0086-\u009f\ufffe\uffff]/g;

/**
 * True when the text, written plain in that place, reads back as the same text without a syntax
 * error. The words YAML 1.1 reads as booleans (`yes`, `no`, `on`, `off`, `y`, `n`), as well as
 * `true`, `false` and `null`, are quoted, in any case.
 */
function readsBack(text: string, place: YamlPlace): boolean {
  if (keywords.test(text)) return false;
  if (simple.test(text)) return true;
  if (text === "" || /[\r\n]/.test(text)) return false;
  const source = place === "flow" ? `{ k: ${text} }` : `k: ${text}\n`;
  const document = parseDocument(source, { logLevel: "silent" });
  if (document.errors.length > 0) return false;
  const value: unknown = document.toJS();
  return isRecord(value) && Object.keys(value).length === 1 && value.k === text;
}

/** Text in double quotes, with JSON's escapes and `\u` for what YAML does not allow as it is. */
function quoted(text: string): string {
  return JSON.stringify(text).replace(
    unprintable,
    (found) => `\\u${found.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/** A number as YAML writes it. */
function numberText(value: number): string {
  if (Number.isNaN(value)) return ".nan";
  if (!Number.isFinite(value)) return value > 0 ? ".inf" : "-.inf";
  return String(value);
}

/** Text written plain when it reads back as itself in that place, else in double quotes. */
export function yamlText(text: string, place: YamlPlace): string {
  return readsBack(text, place) ? text : quoted(text);
}

/** A list or mapping on one line, `[a, b]` or `{ a: 1, b: 2 }`; any other value as a scalar. */
export function yamlValue(value: unknown, place: YamlPlace): string {
  if (typeof value === "string") return yamlText(value, place);
  if (typeof value === "number") return numberText(value);
  if (typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map((item) => yamlValue(item, "flow")).join(", ")}]`;
  if (typeof value === "object" && value !== null) return flowMapping(Object.entries(value));
  return "null";
}

/** Keys and values as a one-line flow mapping, `{ a: 1, b: 2 }`, or `{}`. */
export function flowMapping(entries: readonly [string, unknown][]): string {
  if (entries.length === 0) return "{}";
  const pairs = entries.map(
    ([key, value]) => `${yamlText(key, "flow")}: ${yamlValue(value, "flow")}`,
  );
  return `{ ${pairs.join(", ")} }`;
}
