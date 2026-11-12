// Decoding a file's text and parsing the formats readers share. A refusal gives only where the
// parser stopped: the parser's own message may quote the file.
import { parse } from "txml/txml";
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
export function parseYaml(text: string, file: string): ParseResult {
  const lines = new LineCounter();
  const document = parseDocument(text, { lineCounter: lines, logLevel: "error" });
  const error = document.errors[0];
  if (error !== undefined) {
    const at = error.linePos?.[0];
    return notValid("YAML", file, at && { line: at.line, column: at.col });
  }
  try {
    return { value: document.toJS() as unknown };
  } catch {
    return notValid("YAML", file);
  }
}

/** A parsed file's value, or the refusal saying where parsing stopped. */
export type ParseResult = { value: unknown } | Refused;

/** An XML element: its name as written (`edmx:Edmx`), attributes and children. */
export interface XmlNode {
  tagName: string;
  attributes: Record<string, string | null>;
  children: (XmlNode | string)[];
}

/** An XML file's top-level nodes, or the refusal saying where parsing stopped. */
export type XmlResult = { value: XmlNode[] } | Refused;

const markup: [string, string][] = [
  ["<!--", "-->"],
  ["<![CDATA[", "]]>"],
  ["<?", "?>"],
  ["<!", ">"],
];

/** The index after the comment, CDATA section, instruction or declaration at `at`; -1 when it never ends; undefined for a tag. */
function skipMarkup(text: string, at: number): number | undefined {
  for (const [start, end] of markup) {
    if (!text.startsWith(start, at)) continue;
    const found = text.indexOf(end, at + start.length);
    return found < 0 ? -1 : found + end.length;
  }
  return undefined;
}

/** The index after the tag at `at`; -1 when a `<` or the end of the text comes first. A quoted value may hold `>` or `<`. */
function tagEnd(text: string, at: number): number {
  let index = at + 1;
  while (index < text.length) {
    const char = text[index]!;
    if (char === ">") return index + 1;
    if (char === "<") return -1;
    if (char === '"' || char === "'") {
      const close = text.indexOf(char, index + 1);
      if (close < 0) return -1;
      index = close + 1;
    } else index++;
  }
  return -1;
}

/**
 * True when every start tag is closed by the end of the text and no `<` stands inside a tag, which
 * the parser does not check. One pass over the text: each part of it is looked at once.
 */
function closesEveryTag(text: string): boolean {
  let open = 0;
  let at = text.indexOf("<");
  while (at >= 0) {
    const skipped = skipMarkup(text, at);
    const end = skipped ?? tagEnd(text, at);
    if (end < 0) return false;
    if (skipped === undefined) open += text[at + 1] === "/" ? -1 : text[end - 2] === "/" ? 0 : 1;
    if (open < 0) return false;
    at = text.indexOf("<", end);
  }
  return open === 0;
}

/**
 * The nodes of XML text, with the entities in names and values decoded, or the refusal saying
 * where it stopped. The parser's own message is never shown: it may quote the file.
 */
export function parseXml(text: string, file: string): XmlResult {
  let nodes: (XmlNode | string)[];
  try {
    nodes = parse(text, { decodeEntities: true, skipXmlDeclaration: true });
  } catch (error) {
    const place = /Line: (\d+)\s+Column: (\d+)/.exec((error as Error).message);
    return place
      ? notValid("XML", file, { line: Number(place[1]) + 1, column: Number(place[2]) })
      : notValid("XML", file);
  }
  const elements = nodes.filter((node): node is XmlNode => typeof node !== "string");
  return elements.length === 0 || !closesEveryTag(text)
    ? notValid("XML", file)
    : { value: elements };
}

/** Runs `parse` the first time it is called, and gives that result every time after. */
export function once<T>(parse: () => T): () => T {
  let done: { result: T } | undefined;
  return () => (done ??= { result: parse() }).result;
}
