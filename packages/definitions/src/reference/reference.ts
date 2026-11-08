// Every field described once, from the schemas and the packs, for the editor
// (completion, hover, the reference panel) and the documentation site alike.
import { manifestSchema, type JsonSchema } from "@ingestron/config";
import { contractNotes } from "../documents/contract-notes.js";
import { kinds } from "../documents/documents.js";
import { isRecord } from "../internal/merge.js";
import type { PackInfo } from "../pack/pack.js";
import { branches, expand, type Schema } from "./schema-nodes.js";
import { merged, typeWords } from "./type-words.js";

/** One field: what it is, what it accepts, and the page that explains it. */
export interface FieldInfo {
  /** Keys from the document or settings root; `*` stands for any key or list item. */
  path: string[];
  name: string;
  description?: string;
  /** In words, such as "text", "a mapping" or "one of the values". */
  type: string;
  required: boolean;
  /** The allowed values, each with its meaning when the schema gives one. */
  values?: { value: unknown; description?: string }[];
  default?: unknown;
  /** The least number allowed, from the schema's `minimum`. */
  minimum?: number;
  /** The greatest number allowed, from the schema's `maximum`. */
  maximum?: number;
  example?: unknown;
  /** For a method setting: the file it belongs in. */
  placement?: "platform" | "standard" | "definition";
  /** The documentation page and anchor, such as `/docs/reference/documents#flow-source`. */
  docs: string;
}

/** The document kinds with a reference section, by their `kind`; `Project` is project.yaml. */
export const referenceKinds = {
  Project: { schema: withExamples(manifestSchema, { id: "retail", name: "Retail sales" }) },
  Standard: kinds.standard,
  Platform: kinds.platform,
  Connection: kinds.connection,
  Flow: kinds.flow,
  Transform: kinds.transform,
  DataContract: kinds.contract,
} as const;

/** A schema with an example for each of these top-level fields. */
function withExamples(schema: JsonSchema, examples: Record<string, string>): JsonSchema {
  const node = schema as Record<string, unknown>;
  const properties = (node.properties ?? {}) as Record<string, Record<string, unknown>>;
  const added = Object.entries(examples).map(([key, value]) => [
    key,
    { ...properties[key], examples: [value] },
  ]);
  return { ...node, properties: { ...properties, ...Object.fromEntries(added) } } as JsonSchema;
}

/** Every field of a document kind, depth first. */
export function documentReference(kind: keyof typeof referenceKinds): FieldInfo[] {
  const schema = referenceKinds[kind].schema as Schema;
  const anchor = (path: string[]) =>
    `/docs/reference/documents#${anchorOf([kind.toLowerCase(), ...path])}`;
  const fields = walk(schema, schema, [], anchor);
  return kind === "DataContract" ? fields.map(withNote) : fields;
}

/** A contract field with Ingestron's note applied. */
function withNote(field: FieldInfo): FieldInfo {
  const note = contractNotes[field.path.join(".")];
  if (!note) return field;
  const description = [field.description ?? note.description, note.ingestron]
    .filter(Boolean)
    .join(" ");
  const values = field.values?.map((item) => ({
    ...item,
    ...(note.meanings?.[String(item.value)] && { description: note.meanings[String(item.value)] }),
  }));
  return {
    ...field,
    ...(description && { description }),
    ...(values && { values }),
    ...(note.example !== undefined && { example: note.example }),
  };
}

/** Every setting of a pack's method, with its default and where it belongs. */
export function methodReference(pack: PackInfo, id: string): FieldInfo[] {
  const method = pack.methods[id];
  if (!method) return [];
  const schema = method.settings as Schema;
  const anchor = (path: string[]) => `/docs/reference/packs/${pack.id}#${anchorOf([id, ...path])}`;
  const { platform = [], standard = [] } = method.placement ?? {};
  return walk(schema, schema, [], anchor).map((field) => {
    const [top = ""] = field.path;
    const placement = platform.includes(top)
      ? "platform"
      : standard.includes(top)
        ? "standard"
        : "definition";
    const own = field.path.length === 1 ? method.defaults?.[top] : undefined;
    return { ...field, placement, ...(own !== undefined && { default: own }) };
  });
}

/** `flow-tables-item-ingest-uses`: lower case, `*` as `item`, joined with `-`. */
export function anchorOf(parts: string[]): string {
  return parts
    .map((part) => (part === "*" ? "item" : part.toLowerCase().replace(/[^a-z0-9]+/g, "-")))
    .join("-");
}

function walk(
  root: Schema,
  schema: Schema,
  path: string[],
  anchor: (path: string[]) => string,
  seen: ReadonlySet<string> = new Set(),
): FieldInfo[] {
  // A schema that refers back to itself, such as a column with nested columns, is described once.
  const reference = typeof schema.$ref === "string" ? schema.$ref : undefined;
  if (reference && seen.has(reference)) return [];
  const inside = reference ? new Set([...seen, reference]) : seen;
  const parts = branches(root, schema);
  const properties = Object.assign({}, ...parts.map((part) => part.properties ?? {})) as Record<
    string,
    Schema
  >;
  const required = requiredOf(root, schema);
  const own = Object.entries(properties).flatMap(([name, child]) => {
    const field = describe(root, child, [...path, name], required.includes(name), anchor);
    return [field, ...walk(root, child, [...path, name], anchor, inside)];
  });
  const nested = parts.flatMap((part) => [
    ...mappingValues(root, part.additionalProperties, [...path, "*"], anchor),
    ...[part.items, part.additionalProperties]
      .filter(isRecord)
      .flatMap((child) => walk(root, child, [...path, "*"], anchor, inside)),
  ]);
  return [...own, ...unique(nested)];
}

/**
 * The values of a mapping, its `additionalProperties`, as the field `*`, when they say
 * something of their own: a description, allowed values, a range, a default or an example.
 * Otherwise the mapping's own field says all there is.
 */
function mappingValues(
  root: Schema,
  values: unknown,
  path: string[],
  anchor: (path: string[]) => string,
): FieldInfo[] {
  if (!isRecord(values)) return [];
  const field = describe(root, values, path, false, anchor);
  const own = ["description", "values", "minimum", "maximum", "default", "example"] as const;
  return own.some((key) => field[key] !== undefined) ? [field] : [];
}

/** What every form requires: the schema's own `required` and its `allOf` parts', not one alternative's. */
function requiredOf(root: Schema, schema: Schema): string[] {
  const node = expand(root, schema);
  const parts = Array.isArray(node.allOf) ? (node.allOf as Schema[]).filter(isRecord) : [];
  return [
    ...((node.required ?? []) as string[]),
    ...parts.flatMap((part) => requiredOf(root, part)),
  ];
}

/** Fields once each by path, the first description winning. */
function unique(fields: FieldInfo[]): FieldInfo[] {
  const seen = new Set<string>();
  return fields.filter((field) => {
    const key = field.path.join("/");
    return !seen.has(key) && Boolean(seen.add(key));
  });
}

function describe(
  root: Schema,
  schema: Schema,
  path: string[],
  required: boolean,
  anchor: (path: string[]) => string,
): FieldInfo {
  const parts = branches(root, schema);
  const pick = <T>(key: string) =>
    (schema[key] ?? parts.map((part) => part[key]).find((value) => value !== undefined)) as
      T | undefined;
  const node = merged(parts, schema);
  const values = valuesOf(node);
  const examples = pick<unknown[]>("examples");
  const description = pick<string>("description");
  const fallback = pick<unknown>("default");
  const minimum = pick<number>("minimum");
  const maximum = pick<number>("maximum");
  return {
    path,
    name: path.at(-1) ?? "",
    type: typeWords(root, schema),
    required,
    docs: anchor(path),
    ...(description && { description }),
    ...(values && { values }),
    ...(fallback !== undefined && { default: fallback }),
    ...(typeof minimum === "number" && { minimum }),
    ...(typeof maximum === "number" && { maximum }),
    ...(examples?.length && { example: examples[0] }),
  };
}

function valuesOf(node: Schema): FieldInfo["values"] {
  if (node.const !== undefined) return [{ value: node.const }];
  if (!Array.isArray(node.enum)) return undefined;
  const meanings = (node.enumDescriptions ?? []) as (string | undefined)[];
  return node.enum.map((value, index) => ({
    value,
    ...(meanings[index] && { description: meanings[index] }),
  }));
}
