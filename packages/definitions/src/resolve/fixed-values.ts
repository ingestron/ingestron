// What the standard fixes: finding the values that change a fixed one, and
// reporting them (specification sections 3 and 11.2).
import type { Context } from "../context/index.js";
import type { Source } from "../diagnostics/index.js";
import { isRecord, sameValue } from "../internal/index.js";

/** The location of the value at `path` inside the value written at `at`. */
export function placed(at: Source, path: string[]): Source {
  const pointer = path.map((key) => `/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`);
  return { document: at.document, pointer: at.pointer + pointer.join("") };
}

/** `FIXED_SETTING` at the value that changes a fixed one, as `changedFixed` finds it. */
export function reportFixed(
  context: Context,
  { path, value }: { path: string[]; value: unknown },
  at?: Source,
): void {
  const remove = at && {
    title: "Remove this setting",
    edits: [{ file: at.document.file, pointer: at.pointer, remove: true as const }],
  };
  context.reporter.error(
    "FIXED_SETTING",
    `The standard fixes "${path.join(".")}" to ${JSON.stringify(value)}.`,
    at,
    "Remove this setting, or change the standard.",
    remove ? [remove] : [],
  );
}

/**
 * The fixed values that `value` changes, with their key paths. Mappings in
 * both are compared key by key, so keys beside the fixed ones are allowed. A
 * value that is `unknown`, such as one holding an unset reference, changes nothing.
 */
export function changedFixed(
  fixed: Record<string, unknown>,
  value: Record<string, unknown>,
  path: string[],
  unknown: (value: unknown) => boolean,
): { path: string[]; value: unknown }[] {
  return Object.entries(value).flatMap(([key, given]) => {
    if (!(key in fixed)) return [];
    const wanted = fixed[key];
    if (isRecord(wanted) && isRecord(given))
      return changedFixed(wanted, given, [...path, key], unknown);
    if (unknown(given)) return [];
    return sameValue(wanted, given) ? [] : [{ path: [...path, key], value: wanted }];
  });
}
