// Turns JSON Schema failures into problems written for the person editing
// the YAML: field paths as written, what is wrong in words, and a hint with
// the field's description and example (specification section 3.1).

import type { ErrorObject } from "ajv/dist/ajv.js";
import { stringify } from "yaml";
import { isRecord } from "./data.js";
import { nearNames } from "./distance.js";
import { parsePointer } from "./json-pointer.js";
import type { JsonSchema } from "./kinds.js";

type Schema = Record<string, unknown>;

/** The message and hint for one failure; `undefined` for a failure that repeats another. */
export function describeFailure(
  failure: ErrorObject,
  all: readonly ErrorObject[],
  root: JsonSchema,
): { message: string; hint?: string } | undefined {
  if (repeats(failure, all)) return undefined;
  const keys = parsePointer(failure.instancePath) ?? [];
  const path = pathText(keys);
  const message = messageFor(failure, path, keys.length === 0);
  return { message, ...hintFor(failure, keys, root as Schema) };
}

const branching = new Set(["oneOf", "anyOf", "if"]);

/** One alternative of a oneOf or anyOf: its failures are summed up by the oneOf or anyOf. */
const inAlternative = (failure: ErrorObject) => /\/(oneOf|anyOf)\/\d+\//.test(failure.schemaPath);

/** A failure another one already explains (specification section 3.1). */
function repeats(failure: ErrorObject, all: readonly ErrorObject[]): boolean {
  const at = failure.instancePath;
  if (failure.keyword === "minProperties")
    return all.some((other) => other.keyword === "required" && other.instancePath === at);
  if (inAlternative(failure)) return true;
  if (!branching.has(failure.keyword)) return false;
  return all.some(
    (other) =>
      other !== failure &&
      !branching.has(other.keyword) &&
      !inAlternative(other) &&
      (other.instancePath === at || other.instancePath.startsWith(`${at}/`)),
  );
}

/** `a.b[0].c`, or "The document" at the root. */
export function pathText(keys: readonly string[]): string {
  if (keys.length === 0) return "The document";
  return keys
    .map((key, index) =>
      /^\d+$/.test(key)
        ? `[${key}]`
        : /^[\w-]+$/.test(key)
          ? `${index === 0 ? "" : "."}${key}`
          : `["${key}"]`,
    )
    .join("");
}

type Phrase = (failure: ErrorObject, path: string, atRoot: boolean) => string;

/** One message per kind of failure; anything else falls back to the validator's words. */
const phrases: Record<string, Phrase> = {
  type: ({ data, params }, path) =>
    data === null || data === undefined
      ? `${path} is empty; it must be ${expected(String(params.type))}.`
      : `${path} is ${actual(data)}; it must be ${expected(String(params.type))}.`,
  required: ({ params }, path) => `${path} needs "${String(params.missingProperty)}".`,
  additionalProperties: ({ params, parentSchema }, path, atRoot) =>
    unknownField(String(params.additionalProperty), atRoot ? "the document" : path, parentSchema),
  enum: ({ data, params }, path) =>
    `${path} is ${JSON.stringify(data)}; use one of: ${(params.allowedValues as unknown[]).map(plain).join(", ")}.`,
  const: ({ params }, path) => `${path} must be ${plain(params.allowedValue)}.`,
  pattern: ({ data }, path) => `${path} ${JSON.stringify(data)} is not in the expected form.`,
  oneOf: (_failure, path) => `${path} does not match any of the forms allowed here.`,
  anyOf: (_failure, path) => `${path} does not match any of the forms allowed here.`,
};

function messageFor(failure: ErrorObject, path: string, atRoot: boolean): string {
  const phrase = phrases[failure.keyword];
  if (phrase) return phrase(failure, path, atRoot);
  return limits(failure, path) ?? `${path} ${failure.message ?? "is not valid"}.`;
}

function limits(failure: ErrorObject, path: string): string | undefined {
  const limit = (failure.params as { limit?: number }).limit;
  const words: Record<string, string> = {
    minLength: `must have at least ${limit} characters`,
    minItems: `must have at least ${limit} items`,
    minProperties: `must have at least ${limit} fields`,
    minimum: `must be at least ${limit}`,
    maximum: `must be at most ${limit}`,
  };
  const phrase = words[failure.keyword];
  return phrase && `${path} ${phrase}.`;
}

const typeWords: Record<string, string> = {
  object: "a mapping",
  array: "a list",
  string: "text",
  number: "a number",
  integer: "a whole number",
  boolean: "true or false",
  null: "empty",
};

function expected(types: string): string {
  return types
    .split(",")
    .map((type) => typeWords[type] ?? type)
    .join(" or ");
}

function actual(value: unknown): string {
  if (Array.isArray(value)) return "a list";
  if (isRecord(value)) return "a mapping";
  return JSON.stringify(value);
}

function plain(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function unknownField(field: string, where: string, parent: unknown): string {
  const known = Object.keys((parent as { properties?: object } | undefined)?.properties ?? {});
  const [near] = nearNames(field, known);
  return `"${field}" is not a field of ${where}.${near ? ` Did you mean "${near}"?` : ""}`;
}

function hintFor(failure: ErrorObject, keys: readonly string[], root: Schema): { hint?: string } {
  if (failure.keyword === "oneOf" || failure.keyword === "anyOf") return formsHint(failure);
  if (failure.keyword === "additionalProperties") {
    const known = Object.keys(
      (failure.parentSchema as { properties?: object } | undefined)?.properties ?? {},
    );
    return known.length > 0 ? { hint: `Fields: ${known.join(", ")}.` } : {};
  }
  const field =
    failure.keyword === "required" ? [...keys, String(failure.params.missingProperty)] : [...keys];
  const hint = describeField(schemasAt(root, field), field.at(-1));
  return hint ? { hint } : {};
}

/** What the alternatives of a oneOf or anyOf ask for: a field each, or a type each. */
function formsHint({ schema }: ErrorObject): { hint?: string } {
  const branches = (Array.isArray(schema) ? schema : []).filter(isRecord);
  const fields = branches.map((branch) => (branch.required as string[] | undefined)?.[0]);
  if (branches.length > 0 && fields.every(Boolean))
    return { hint: `Give one of: ${fields.join(", ")}.` };
  const types = branches.map((branch) => branch.type);
  if (branches.length > 0 && types.every((type) => typeof type === "string"))
    return { hint: `It may be ${expected(types.join(","))}.` };
  return {};
}

function describeField(schemas: Schema[], key: string | undefined): string | undefined {
  const description = schemas
    .map((schema) => schema.description)
    .find((text) => typeof text === "string");
  const examples = schemas.map((schema) => schema.examples).find(Array.isArray) as
    unknown[] | undefined;
  const example =
    key && /^\D/.test(key) && examples?.length
      ? `For example:\n${stringify({ [key]: examples[0] })
          .trimEnd()
          .replace(/^/gm, "  ")}`
      : undefined;
  const parts = [description as string | undefined, example].filter(Boolean);
  return parts.length > 0 ? parts.join("\n") : undefined;
}

/** The schemas that describe the value at `keys`, outermost first, following $ref. */
export function schemasAt(root: Schema, keys: readonly string[]): Schema[] {
  let current = expand(root, root);
  for (const key of keys) {
    current = current.flatMap((schema) => {
      const properties = schema.properties as Record<string, Schema> | undefined;
      const next =
        properties?.[key] ??
        (schema.items as Schema | undefined) ??
        (isRecord(schema.additionalProperties)
          ? (schema.additionalProperties as Schema)
          : undefined);
      return next ? expand(root, next) : [];
    });
  }
  return current;
}

function expand(root: Schema, schema: Schema): Schema[] {
  const reference = typeof schema.$ref === "string" ? lookup(root, schema.$ref) : undefined;
  return reference ? [schema, ...expand(root, reference)] : [schema];
}

function lookup(root: Schema, reference: string): Schema | undefined {
  const [, group, name] = /^#\/(\$defs|definitions)\/(.+)$/.exec(reference) ?? [];
  const defs = root[group ?? ""] as Record<string, Schema> | undefined;
  return name ? defs?.[name] : undefined;
}
