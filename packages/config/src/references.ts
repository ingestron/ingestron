// Reads the `${…}` syntax inside one string. Pure text processing: nothing here
// looks values up or reads files. The grammar is in spec/config/syntax.md §4.1.

import type { DiagnosticCode } from "./diagnostics.js";
import { nearNames } from "./distance.js";

/** The names allowed before the first dot in `${root.path}`. */
export const referenceRoots = ["values", "environment", "project"] as const;
/** The names allowed before the colon in `${resolver:argument}`. */
export const resolverNames = ["file", "envvar", "secret"] as const;

/** One of {@link referenceRoots}. */
export type ReferenceRoot = (typeof referenceRoots)[number];
/** One of {@link resolverNames}. */
export type ResolverName = (typeof resolverNames)[number];

/** What a `${…}` asks for: a path into project data, or a resolver call. */
export type Expression =
  | { type: "path"; root: ReferenceRoot; path: string[] }
  | { type: "resolver"; resolver: ResolverName; argument: string };

/** A piece of a definition string: literal text, or one `${…}` reference. */
export type Segment =
  { type: "text"; text: string } | { type: "reference"; source: string; expression: Expression };

/** The outcome of reading a string: its segments, or why it is invalid. */
export type ParseResult =
  | { ok: true; segments: Segment[] }
  | { ok: false; code: DiagnosticCode; message: string; hint: string };

/**
 * Splits a definition string into text and references.
 * `$${` is read as the literal text `${`.
 * @example
 * parseDefinitionString("raw_${environment.name}")
 * // { ok: true, segments: [{ type: "text", text: "raw_" }, { type: "reference", … }] }
 */
export function parseDefinitionString(text: string): ParseResult {
  const segments: Segment[] = [];
  let literal = "";
  let index = 0;
  while (index < text.length) {
    if (text.startsWith("$${", index)) {
      literal += "${";
      index += 3;
      continue;
    }
    if (!text.startsWith("${", index)) {
      literal += text[index];
      index += 1;
      continue;
    }
    const reference = readReference(text, index);
    if (!reference.ok) return reference;
    if (literal) segments.push({ type: "text", text: literal });
    literal = "";
    segments.push(reference.segment);
    index = reference.end;
  }
  if (literal || segments.length === 0) segments.push({ type: "text", text: literal });
  return { ok: true, segments };
}

type ReadResult = { ok: true; segment: Segment; end: number } | Extract<ParseResult, { ok: false }>;

/** Reads the `${…}` that starts at `start`. */
function readReference(text: string, start: number): ReadResult {
  const close = text.indexOf("}", start + 2);
  if (close < 0) {
    return refusal(
      "UNCLOSED_REFERENCE",
      `"${text.slice(start)}" has no closing "}".`,
      text.slice(start),
    );
  }
  const source = text.slice(start, close + 1);
  const expression = parseExpression(text.slice(start + 2, close).trim());
  if (!expression) {
    const snippet = placeholderSnippet(text, start, source);
    const near = nearReference(text.slice(start + 2, close).trim());
    const message = `"${snippet}" is not a reference.${near ? ` Did you mean "${near}"?` : ""}`;
    return { ok: false, code: "UNKNOWN_REFERENCE", message, hint: `${forms} ${keepText(snippet)}` };
  }
  return { ok: true, segment: { type: "reference", source, expression }, end: close + 1 };
}

function refusal(code: DiagnosticCode, message: string, snippet: string) {
  return { ok: false as const, code, message, hint: keepText(snippet) };
}

const keepText = (snippet: string) => `To keep "${snippet}" as text, write "$${snippet}".`;

const forms =
  "A reference is ${values.<name>}, ${environment.<name>}, ${project.<name>}, " +
  "${file:<path>}, ${envvar:<name>} or ${secret:<name>}.";

/** The reference meant, when a root or resolver name is a near miss: `value.x` → `${values.x}`. */
function nearReference(body: string): string | undefined {
  const [, name = "", separator, rest] = /^([\w-]+)([.:])(.*)$/s.exec(body) ?? [];
  const names: readonly string[] = separator === ":" ? resolverNames : referenceRoots;
  const [near] = nearNames(name, names);
  const fixed = near && `${near}${separator}${rest}`;
  return fixed && parseExpression(fixed) ? `\${${fixed}}` : undefined;
}

/**
 * The text to show for a placeholder that is not ours. For `${{ x }}`
 * (GitHub Actions, Azure Pipelines) show everything up to "}}".
 */
function placeholderSnippet(text: string, start: number, source: string): string {
  if (text[start + 2] !== "{") return source;
  const doubleClose = text.indexOf("}}", start);
  return doubleClose < 0 ? source : text.slice(start, doubleClose + 2);
}

const segmentPattern = /^[A-Za-z0-9_-]+$/;

/** Reads `root.a.b` or `resolver:argument`; `undefined` when it is neither. */
function parseExpression(body: string): Expression | undefined {
  const colon = body.indexOf(":");
  if (colon >= 0) {
    const resolver = body.slice(0, colon);
    const argument = body.slice(colon + 1).trim();
    if (!isResolverName(resolver) || argument === "") return undefined;
    return { type: "resolver", resolver, argument };
  }
  const [root, ...path] = body.split(".");
  if (!isReferenceRoot(root) || path.length === 0) return undefined;
  if (!path.every((part) => segmentPattern.test(part))) return undefined;
  return { type: "path", root, path };
}

function isResolverName(name: string): name is ResolverName {
  return (resolverNames as readonly string[]).includes(name);
}

function isReferenceRoot(name: string | undefined): name is ReferenceRoot {
  return (referenceRoots as readonly string[]).includes(name ?? "");
}
