// Fixes for schema problems with an obvious remedy (specification section 6.1).

import type { ErrorObject } from "ajv/dist/ajv.js";
import type { Fix } from "./diagnostics.js";
import { nearNames } from "./distance.js";
import { appendPointer } from "./json-pointer.js";
import type { JsonSchema } from "./kinds.js";
import { parsePointer } from "./json-pointer.js";
import { schemasAt } from "./schema-messages.js";

/** At most this many allowed values are offered, one fix each. */
const maxValues = 8;

/** The fixes for one failure in the document of `file`. */
export function schemaFixes(failure: ErrorObject, file: string, root: JsonSchema): Fix[] {
  const { instancePath: pointer, params } = failure;
  if (failure.keyword === "additionalProperties") {
    const field = String(params.additionalProperty);
    const known = Object.keys((failure.parentSchema as { properties?: object }).properties ?? {});
    return nearNames(field, known)
      .slice(0, 1)
      .map((name) => ({
        title: `Rename to "${name}"`,
        edits: [{ file, pointer: appendPointer(pointer, field), rename: name }],
      }));
  }
  if (failure.keyword === "enum") return valueFixes(failure, file);
  if (failure.keyword === "required") return requiredFixes(failure, file, root);
  return [];
}

/** One per allowed value, the closest to what was written first. */
function valueFixes({ instancePath: pointer, params, data }: ErrorObject, file: string): Fix[] {
  const values = params.allowedValues as unknown[];
  if (values.length > maxValues) return [];
  const [closest] = nearNames(String(data), values.map(String));
  const ordered = [
    ...values.filter((value) => String(value) === closest),
    ...values.filter((value) => String(value) !== closest),
  ];
  return ordered.map((value) => ({
    title: `Change to ${JSON.stringify(value)}`,
    edits: [{ file, pointer, set: value }],
  }));
}

/** The field with its schema's default, else its first example. */
function requiredFixes(
  { instancePath, params }: ErrorObject,
  file: string,
  root: JsonSchema,
): Fix[] {
  const field = String(params.missingProperty);
  const keys = [...(parsePointer(instancePath) ?? []), field];
  const schemas = schemasAt(root as Record<string, unknown>, keys);
  const known =
    schemas.find((schema) => "default" in schema)?.default ??
    (schemas.map((schema) => schema.examples).find(Array.isArray) as unknown[] | undefined)?.[0];
  if (known === undefined) return [];
  return [
    {
      title: `Add "${field}"`,
      edits: [{ file, pointer: appendPointer(instancePath, field), set: known }],
    },
  ];
}
