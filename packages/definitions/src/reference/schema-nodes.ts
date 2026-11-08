// Reading a JSON Schema as the reference and the pack checks do: a schema with
// its branches, each local `$ref` followed.
import { isRecord } from "../internal/merge.js";

/** A JSON Schema node, read as data. */
export type Schema = Record<string, unknown>;

/** The schema and the branches of its `allOf`, `anyOf`, `oneOf`, `then` and `else`, each with `$ref` followed. */
export function branches(root: Schema, schema: Schema): Schema[] {
  const node = expand(root, schema);
  // A conditional's `then` and `else` add fields too, such as an ODCS rule's metric.
  const more = [
    ...["allOf", "anyOf", "oneOf"].flatMap((key) =>
      Array.isArray(node[key]) ? (node[key] as Schema[]) : [],
    ),
    ...["then", "else"].map((key) => node[key]).filter(isRecord),
  ];
  return [node, ...more.flatMap((branch) => (isRecord(branch) ? branches(root, branch) : []))];
}

/** The schema with a local `$ref` (`#/$defs/<name>`) replaced by what it names. */
export function expand(root: Schema, schema: Schema): Schema {
  const reference = typeof schema.$ref === "string" ? schema.$ref : undefined;
  const name = reference && /^#\/\$defs\/(.+)$/.exec(reference)?.[1];
  const target = name ? (root.$defs as Record<string, Schema> | undefined)?.[name] : undefined;
  return target ? { ...expand(root, target), ...schema, $ref: undefined } : schema;
}
