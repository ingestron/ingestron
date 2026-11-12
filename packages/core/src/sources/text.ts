// Decoding a file's text and parsing the formats readers share. A refusal gives only where the
// parser stopped: the parser's own message may quote the file.
import { LineCounter, parseDocument } from "yaml";
import type { Refused } from "./result.js";

/** The text of bytes as UTF-8, without a byte-order mark. */
export function decodeText(contents: string | Uint8Array): string {
  const text = typeof contents === "string" ? contents : new TextDecoder("utf-8").decode(contents);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** The file's last extension, in lower case, with its dot; empty when it has none. */
export function extensionOf(file: string): string {
  const name = file.slice(file.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

function notValid(format: string, file: string, at?: { line: number; column: number }): Refused {
  const place = at ? ` at line ${at.line}, column ${at.column}` : "";
  return { refused: [`${file} is not valid ${format}${place}.`] };
}

/** The line and column, from 1, of an offset in the text. */
export function placeOf(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset).split("\n");
  return { line: before.length, column: (before[before.length - 1] ?? "").length + 1 };
}

/** The value of JSON text, or the refusal saying where it stopped. */
export function parseJson(
  text: string,
  file: string,
  lineOffset = 0,
): { value: unknown } | Refused {
  try {
    return { value: JSON.parse(text) as unknown };
  } catch (error) {
    const offset = /position (\d+)/.exec((error as Error).message)?.[1];
    if (offset === undefined) return notValid("JSON", file);
    const at = placeOf(text, Number(offset));
    return notValid("JSON", file, { line: at.line + lineOffset, column: at.column });
  }
}

/** The value of YAML text (JSON is YAML too), or the refusal saying where it stopped. */
export function parseYaml(text: string, file: string): { value: unknown } | Refused {
  const lines = new LineCounter();
  const document = parseDocument(text, { lineCounter: lines });
  const error = document.errors[0];
  if (error === undefined) return { value: document.toJS() as unknown };
  const at = error.linePos?.[0];
  return notValid("YAML", file, at && { line: at.line, column: at.col });
}
