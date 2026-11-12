// The markers around the section Ingestron owns in AGENTS.md, and how a file's state is told
// (spec/cli/assistants.md, section 3).
import { createHash } from "node:crypto";

/** The begin-marker line, without its line ending. */
export const beginMarker =
  "<!-- ingestron:begin guide 1. Ingestron writes this section and `ingestron apply` keeps it current. Write your own notes outside it, or delete both markers to make it yours. -->";

const beginStart = "<!-- ingestron:begin guide ";
const endStart = "<!-- ingestron:end";
const endLine = /^<!-- ingestron:end sha256:([0-9a-f]{64}) -->$/;

/** The end-marker line for a section's text, without its line ending. */
export function endMarker(body: string): string {
  return `<!-- ingestron:end sha256:${hashOf(body)} -->`;
}

/** The lower-case SHA-256 of text, with CRLF read as LF, in UTF-8. */
export function hashOf(text: string): string {
  return createHash("sha256").update(text.replaceAll("\r\n", "\n"), "utf8").digest("hex");
}

/** The line ending of a file: decided by its first line. */
export function lineEnding(text: string): "\r\n" | "\n" {
  const first = text.indexOf("\n");
  return first > 0 && text[first - 1] === "\r" ? "\r\n" : "\n";
}

/** How a file's text stands to the section. */
export type Shape =
  | { kind: "user" }
  | { kind: "edited" }
  | {
      kind: "section";
      /** The offset of the begin-marker line. */
      start: number;
      /** The offset of the end-marker line. */
      endStart: number;
      /** The offset of the end of the end-marker line, before its line ending. */
      end: number;
      /** The hash the end marker records. */
      recorded: string;
    };

/** The marker lines of a text: where each starts, its text without a trailing CR, and where that ends. */
function markerLines(text: string): { offset: number; line: string; end: number }[] {
  const markers: { offset: number; line: string; end: number }[] = [];
  let offset = 0;
  for (;;) {
    const newline = text.indexOf("\n", offset);
    const lineEnd = newline === -1 ? text.length : newline;
    const end = lineEnd > offset && text[lineEnd - 1] === "\r" ? lineEnd - 1 : lineEnd;
    const line = text.slice(offset, end);
    if (line.startsWith("<!-- ingestron:begin") || line.startsWith(endStart))
      markers.push({ offset, line, end });
    if (newline === -1) return markers;
    offset = newline + 1;
  }
}

/** Tells whether a file is the user's, holds one section, or has markers in any other arrangement. */
export function shapeOf(text: string): Shape {
  const [begin, end, ...rest] = markerLines(text);
  if (begin === undefined) return { kind: "user" };
  const recorded = end && endLine.exec(end.line)?.[1];
  if (!end || !recorded || rest.length > 0 || !begin.line.startsWith(beginStart))
    return { kind: "edited" };
  return { kind: "section", start: begin.offset, endStart: end.offset, end: end.end, recorded };
}
