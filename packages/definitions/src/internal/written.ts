// What a document's file says at a JSON Pointer, exactly as written: `${…}` references
// are kept, where the loaded document holds their values. Fixes that move a value use it,
// so a moved value stays a reference and nothing from an environment reaches the file.
import type { FileSource } from "@ingestron/config";
import { isNode, parseDocument, type Document } from "yaml";

/** The JSON Pointer's keys, `~1` and `~0` undone. */
function keysOf(pointer: string): string[] {
  return pointer === ""
    ? []
    : pointer
        .slice(1)
        .split("/")
        .map((key) => key.replaceAll("~1", "/").replaceAll("~0", "~"));
}

/**
 * Files read and parsed, by path, for one resolution: a file with many values asked for is
 * read once. A file that cannot be read is kept as `undefined`. Make one for each resolution
 * and never keep it longer, so that it never holds text that has since changed.
 */
export type ParsedFiles = Map<string, Document | undefined>;

/**
 * The value at the pointer in the file, as written; `undefined` (so not `{ value }`) when the
 * file cannot be read or has nothing there, such as a value that comes in from another file.
 * With `parsed`, the file is read and parsed the first time and kept there.
 */
export function writtenValue(
  files: FileSource,
  file: string,
  pointer: string,
  parsed?: ParsedFiles,
): { value: unknown } | undefined {
  const document = parsed?.has(file) ? parsed.get(file) : parse(files, file, parsed);
  if (document === undefined) return undefined;
  const node = document.getIn(keysOf(pointer), true);
  if (node === undefined) return undefined;
  return { value: isNode(node) ? node.toJS(document) : node };
}

function parse(files: FileSource, file: string, parsed?: ParsedFiles): Document | undefined {
  const text = files.read(file);
  const document = text === undefined ? undefined : parseDocument(text);
  parsed?.set(file, document);
  return document;
}

/** True when the value, anywhere inside it, is text that holds a `${…}` reference. */
export function holdsReference(value: unknown): boolean {
  return JSON.stringify(value)?.includes("${") ?? false;
}
