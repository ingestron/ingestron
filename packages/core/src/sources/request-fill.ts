// Filling a recipe's placeholders for the source request (spec/cli/sources.md, section 1,
// "Placeholders"): a known placeholder is filled, and an extension that follows `{object}` is
// written once when the object ends with it already.

/**
 * The extension that follows `{object}`, unless the object ends with it already (without case),
 * so that `{object}.csv` for `orders.csv` is `orders.csv` (section 1, "Placeholders").
 */
function extensionAfter(object: string, extension: string): string {
  return extension !== "" && object.toLowerCase().endsWith(extension.toLowerCase())
    ? ""
    : extension;
}

/** The text with `{object}` filled, an extension it ends with already written once. */
export function withObject(text: string, object: string): string {
  return text.replace(
    /\{object\}(\.[A-Za-z0-9]+)?/g,
    (_whole, extension: string | undefined) => object + extensionAfter(object, extension ?? ""),
  );
}

/**
 * The text with each known placeholder filled; any other text in braces is left as written. A
 * value that holds `{object}` has it filled too, when the values name a table.
 */
export function fill(text: string, values: Readonly<Record<string, string>>): string {
  return text.replace(
    /\{([A-Za-z][A-Za-z0-9_]*)\}(\.[A-Za-z0-9]+)?/g,
    (whole, name: string, extension: string | undefined) => {
      if (!Object.hasOwn(values, name)) return whole;
      const value = values[name]!;
      const object = values.object;
      const after = extension ?? "";
      if (name === "object") return value + extensionAfter(value, after);
      return (object ? withObject(value, object) : value) + after;
    },
  );
}
