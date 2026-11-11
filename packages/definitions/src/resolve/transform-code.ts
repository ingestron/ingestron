// A transform's code (specification section 5): as written, or for a transform with one input
// and no code, the query that reads that table as it is.
import type { DefinitionDocument } from "@ingestron/config";
import { codeWithValues, type Context } from "../context/index.js";
import type { TransformDoc } from "../documents/index.js";

/**
 * The transform's code with its values in place. A transform with one input and no code
 * reads that table as it is; with any other number of inputs it is `TRANSFORM_CODE`.
 */
export function codeOf(
  context: Context,
  doc: DefinitionDocument<TransformDoc>,
): string | undefined {
  const { id, inputs, code } = doc.value;
  if (code !== undefined) return codeWithValues(context, doc, code);
  const [input] = inputs;
  if (input !== undefined && inputs.length === 1) return `SELECT * FROM {{ tables.${input} }}`;
  context.reporter.error(
    "TRANSFORM_CODE",
    `"${id}" has no code, which a transform may leave out only with one input; it has ${inputs.length}.`,
    { document: doc, pointer: "/inputs" },
    "Write the code, or give the transform one input.",
  );
  return undefined;
}
