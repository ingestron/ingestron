// Text order by code point, shared by the modules that sort names.

/** Text order by code point, the same on every machine, unlike localeCompare. */
export function byCodePoint(left: string, right: string): number {
  const a = [...left].map((character) => character.codePointAt(0)!);
  const b = [...right].map((character) => character.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index++)
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  return a.length - b.length;
}
