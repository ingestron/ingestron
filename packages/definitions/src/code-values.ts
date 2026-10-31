// A transform's code read with ${file:…} is text, which the loader leaves as
// written: here each ${values.<name>} still in the code is replaced for the
// environment, as code written inline already is (specification section 1).
import type { DefinitionDocument } from "@ingestron/config";
import type { Context } from "./context.js";
import { isRecord } from "./merge.js";

/** The code with its values in place, or undefined after reporting a name with no value. */
export function codeWithValues(
  context: Context,
  document: DefinitionDocument,
  code: string,
): string | undefined {
  const values = context.project.values;
  let complete = true;
  const replaced = code.replace(/\$\{values\.([A-Za-z_][\w.]*)\}/g, (written, name: string) => {
    const value = valueAt(values, name.split("."));
    if (value !== undefined && !isRecord(value)) return String(value);
    complete = false;
    context.reporter.error(
      "UNKNOWN_CODE_VALUE",
      `"${written}" in the transform's code names no value.`,
      { document, pointer: "/code" },
      `Values: ${isRecord(values) ? Object.keys(values).join(", ") || "none" : "none"}.`,
    );
    return written;
  });
  return complete ? replaced : undefined;
}

function valueAt(values: unknown, path: string[]): unknown {
  let found = values;
  for (const key of path) found = isRecord(found) ? found[key] : undefined;
  return found;
}
