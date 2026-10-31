// The JSON Schema of a document, and the part of it at a path, following
// $ref, items, additionalProperties and the branches of allOf/anyOf/oneOf.
import { manifestSchema } from "@ingestron/config";
import { templateSchema } from "@ingestron/cli";
import { kinds } from "@ingestron/definitions";

/** A JSON Schema, loosely typed: only the parts the editor reads. */
export interface Schema {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  examples?: unknown[];
  const?: unknown;
  default?: unknown;
  properties?: Record<string, Schema>;
  additionalProperties?: Schema | boolean;
  items?: Schema;
  $ref?: string;
  $defs?: Record<string, Schema>;
  definitions?: Record<string, Schema>;
  allOf?: Schema[];
  anyOf?: Schema[];
  oneOf?: Schema[];
}

/** The schema for a project file: by name for project.yaml and template.yaml, else by its kind. */
export function schemaFor(file: string, kind: string | undefined): Schema | undefined {
  const name = file.split("/").pop();
  if (name === "project.yaml") return manifestSchema as Schema;
  if (name === "template.yaml") return templateSchema as Schema;
  const found = Object.values(kinds).find((item) => item.kind === kind);
  return found?.schema as Schema | undefined;
}

/** The schemas that describe the value at `segments` (several when branches allow it). */
export function schemasAt(root: Schema, segments: string[]): Schema[] {
  let current = expand(root, root);
  for (const segment of segments)
    current = current.flatMap((schema) => child(root, schema, segment));
  return current;
}

function child(root: Schema, schema: Schema, segment: string): Schema[] {
  const found = schema.properties?.[segment] ?? schema.items;
  const next =
    found ??
    (typeof schema.additionalProperties === "object" ? schema.additionalProperties : undefined);
  return next ? expand(root, next) : [];
}

/** The schema with its $ref resolved and its branches listed. */
function expand(root: Schema, schema: Schema): Schema[] {
  const resolved = schema.$ref
    ? { ...lookup(root, schema.$ref), ...schema, $ref: undefined }
    : schema;
  const branches = [
    ...(resolved.allOf ?? []),
    ...(resolved.anyOf ?? []),
    ...(resolved.oneOf ?? []),
  ];
  return [resolved, ...branches.flatMap((branch) => expand(root, branch))];
}

function lookup(root: Schema, reference: string): Schema {
  const [, group, name] = /^#\/(\$defs|definitions)\/(.+)$/.exec(reference) ?? [];
  const defs = group === "definitions" ? root.definitions : root.$defs;
  return (name && defs?.[name]) || {};
}
