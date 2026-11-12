// The logical type of a column's values, as `ingestron contract <sample>` and the source readers
// infer it: the narrowest that every non-empty value fits.

const patterns: [string, RegExp][] = [
  ["integer", /^-?\d+$/],
  ["number", /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/],
  ["boolean", /^(true|false)$/i],
  ["date", /^\d{4}-\d{2}-\d{2}$/],
  ["timestamp", /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/],
];

/**
 * The narrowest logical type every non-empty value fits; integers widen to number.
 * @internal
 */
export function typeOf(values: unknown[]): string {
  const types = new Set(values.filter((value) => value !== "" && value != null).map(typeOfValue));
  if (types.size === 1) return [...types][0]!;
  return types.size === 2 && types.has("integer") && types.has("number") ? "number" : "string";
}

function typeOfValue(value: unknown): string {
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  const text = String(value);
  // A code such as 00123 is an identifier: as a number it would lose its zeros.
  if (/^-?0\d/.test(text)) return "string";
  return patterns.find(([, pattern]) => pattern.test(text))?.[0] ?? "string";
}
