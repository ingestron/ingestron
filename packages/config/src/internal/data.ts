// Small helpers for plain data (the result of reading YAML or JSON).

/** A plain mapping of text keys to values. */
export type DataRecord = Record<string, unknown>;

/** True for a mapping (not a list, not null). */
export function isRecord(value: unknown): value is DataRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const unsafeKeys = new Set(["__proto__", "constructor", "prototype"]);

/**
 * False for keys that could change an object's prototype when copied into
 * a plain object. Such keys are refused wherever data enters the loader.
 */
export function isSafeKey(key: string): boolean {
  return !unsafeKeys.has(key);
}

/**
 * Merges `override` over `base`. Mappings merge key by key; anything else
 * (text, numbers, lists) in `override` replaces the base value.
 */
export function mergeValues(base: unknown, override: unknown): unknown {
  if (!isRecord(base) || !isRecord(override)) return override;
  const merged: DataRecord = { ...base };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = Object.hasOwn(merged, key) ? mergeValues(merged[key], value) : value;
  }
  return merged;
}
