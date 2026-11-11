// What a document's file says at a JSON Pointer, exactly as written: `${…}` references
// are kept, where the loaded document holds their values. Fixes that move a value use it,
// so a moved value stays a reference and nothing from an environment reaches the file.
import type { FileSource } from "@ingestron/config";
import { isNode, parseDocument } from "yaml";

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
 * The value at the pointer in the file, as written; `undefined` (so not `{ value }`) when the
 * file cannot be read or has nothing there, such as a value that comes in from another file.
 */
export function writtenValue(
  files: FileSource,
  file: string,
  pointer: string,
): { value: unknown } | undefined {
  const text = files.read(file);
  if (text === undefined) return undefined;
  const document = parseDocument(text);
  const node = document.getIn(keysOf(pointer), true);
  if (node === undefined) return undefined;
  return { value: isNode(node) ? node.toJS(document) : node };
}

/** True when the value, anywhere inside it, is text that holds a `${…}` reference. */
export function holdsReference(value: unknown): boolean {
  return JSON.stringify(value)?.includes("${") ?? false;
}
