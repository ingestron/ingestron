// Builds a JSON Schema for editors (for example VS Code's YAML extension)
// from a kind's schema, so that unresolved `${…}` text validates while typing.
// The loader itself never uses this: it validates the resolved document.

import type { JsonSchema } from "./kinds.js";

const reference = String.raw`(?:(?:values|environment|project)(?:\.[A-Za-z0-9_-]+)+|(?:file|envvar|secret):\s*[^}\s][^}]*)`;

/** Matches text that is exactly one definition reference, like `${values.workers}`. */
export const wholeReferencePattern = String.raw`^\$\{\s*${reference}\s*\}$`;

/**
 * Matches text whose every `${` is either a definition reference or escaped
 * as `$${`. Kept in step with the parser by test/editor-schema.test.ts.
 */
export const safeTextPattern = String.raw`^(?:[^$]|\$(?!\{)|\$\$\{|\$\{\s*${reference}\s*\})*$`;

// No description: editors would show it on hover in place of the field's own.
const referenceString = { type: "string", pattern: wholeReferencePattern };

/** Keywords whose value is one subschema. `propertyNames` is left out: keys are never interpolated. */
const singleSchemaKeys = [
  "items",
  "additionalProperties",
  "unevaluatedProperties",
  "unevaluatedItems",
  "contains",
  "not",
  "if",
  "then",
  "else",
];
/** Keywords whose value is a list of subschemas. */
const schemaListKeys = ["allOf", "anyOf", "oneOf", "prefixItems"];
/** Keywords whose value maps names to subschemas. */
const schemaMapKeys = [
  "properties",
  "patternProperties",
  "$defs",
  "definitions",
  "dependentSchemas",
];

/**
 * Returns a copy of `schema` for editor use:
 * - a field that is not plain text (number, list, enum, …) also accepts a
 *   whole reference such as `${values.workers}`;
 * - a plain text field rejects a `${…}` that is neither ours nor escaped.
 *
 * The input schema is not changed.
 * @example
 * writeFileSync("pipeline.editor.json", JSON.stringify(toEditorSchema(pipeline.schema)));
 */
export function toEditorSchema(schema: JsonSchema): JsonSchema {
  // The root is a whole document, never a reference, so only its children change.
  return typeof schema === "boolean" ? schema : transformChildren(schema);
}

function transform(schema: JsonSchema): JsonSchema {
  if (typeof schema === "boolean") return schema;
  const copy = transformChildren(schema);
  if (isPlainText(copy)) {
    return { ...annotationsOf(copy), allOf: [copy, { pattern: safeTextPattern }] };
  }
  // anyOf, not oneOf: with an enum, a reference string could match both branches.
  if (hasValueConstraint(copy)) return { ...annotationsOf(copy), anyOf: [copy, referenceString] };
  return copy;
}

/** Keywords editors show on hover and completion; copied onto wrappers. */
const annotationKeys = ["title", "description", "markdownDescription", "default", "examples"];

function annotationsOf(schema: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    annotationKeys.filter((key) => key in schema).map((key) => [key, schema[key]]),
  );
}

function transformChildren(schema: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...schema };
  for (const key of singleSchemaKeys) {
    if (isSchema(copy[key])) copy[key] = transform(copy[key]);
  }
  for (const key of schemaListKeys) {
    if (Array.isArray(copy[key]))
      copy[key] = copy[key].map((child: JsonSchema) => transform(child));
  }
  for (const key of schemaMapKeys) {
    const children = copy[key];
    if (typeof children !== "object" || children === null) continue;
    copy[key] = Object.fromEntries(
      Object.entries(children).map(([name, child]: [string, JsonSchema]) => [
        name,
        transform(child),
      ]),
    );
  }
  return copy;
}

function isSchema(value: unknown): value is JsonSchema {
  return (
    typeof value === "boolean" ||
    (typeof value === "object" && value !== null && !Array.isArray(value))
  );
}

/** Keywords that limit which text is valid; such a field cannot also hold embedded references. */
const textConstraintKeys = ["enum", "const", "pattern", "format", "minLength", "maxLength"];

/** Any text is valid, so embedded references and escapes are too. */
function isPlainText(schema: Record<string, unknown>): boolean {
  return schema.type === "string" && !textConstraintKeys.some((key) => key in schema);
}

function hasValueConstraint(schema: Record<string, unknown>): boolean {
  return "type" in schema || "enum" in schema || "const" in schema;
}
