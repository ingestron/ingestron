// A field's type in words, for the field reference (specification section 10).
import { isRecord } from "../internal/merge.js";
import { branches, expand, type Schema } from "./schema-nodes.js";

/** The schema with its branches merged: its own keywords first, then each branch's in order. */
export function merged(parts: Schema[], schema: Schema): Schema {
  return { ...Object.assign({}, ...[...parts].reverse()), ...schema } as Schema;
}

/**
 * The type in words. An `anyOf` or `oneOf` gives the words of each alternative, taken with
 * the schema's own keywords, once each and joined with ", or ", so that free text beside a
 * list of values, or a number beside a word, is not hidden.
 */
export function typeWords(root: Schema, schema: Schema): string {
  const node = expand(root, schema);
  const alternatives = ["anyOf", "oneOf"]
    .flatMap((key) => (Array.isArray(node[key]) ? (node[key] as unknown[]) : []))
    .filter(isRecord);
  if (alternatives.length === 0) return typeOf(merged(branches(root, schema), schema));
  const own = Object.fromEntries(
    Object.entries(node).filter(([key]) => key !== "anyOf" && key !== "oneOf"),
  );
  const words = alternatives.map((alternative) =>
    typeWords(root, { ...own, ...expand(root, alternative) }),
  );
  return [...new Set(words)].join(", or ");
}

const words: Record<string, string> = {
  object: "a mapping",
  array: "a list",
  string: "text",
  number: "a number",
  integer: "a whole number",
  boolean: "true or false",
};

function typeOf(node: Schema): string {
  if (node.const !== undefined) return String(node.const);
  if (Array.isArray(node.enum)) return "one of the values";
  const types = [node.type].flat().filter((type): type is string => typeof type === "string");
  if (types.length > 0) return types.map((type) => words[type] ?? type).join(" or ");
  return node.properties || node.additionalProperties ? "a mapping" : "any value";
}
