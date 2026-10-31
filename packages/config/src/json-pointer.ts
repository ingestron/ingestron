// JSON Pointers (RFC 6901) such as "/columns/0/name" address a value inside a document.

/**
 * Splits a pointer into its keys. Returns `undefined` for text that is not a
 * pointer (it must be empty or start with "/").
 * @example
 * parsePointer("/a~1b/0") // ["a/b", "0"]
 */
export function parsePointer(pointer: string): string[] | undefined {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) return undefined;
  if (/~[^01]|~$/.test(pointer)) return undefined;
  return pointer
    .slice(1)
    .split("/")
    .map((key) => key.replaceAll("~1", "/").replaceAll("~0", "~"));
}

/** Adds one key to a pointer. */
export function appendPointer(pointer: string, key: string | number): string {
  const escaped = String(key).replaceAll("~", "~0").replaceAll("/", "~1");
  return `${pointer}/${escaped}`;
}
