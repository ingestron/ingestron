import { createAjv, dialectOf, supportedDialects, type Dialect } from "./dialects.js";
import { parsePointer } from "./json-pointer.js";

/**
 * A JSON Schema, as a plain object or `true`/`false`. Draft 2020-12 unless
 * `$schema` declares draft-07 or 2019-09.
 */
export type JsonSchema = { [keyword: string]: unknown } | boolean;

/** What a caller supplies to describe one kind of document. */
export interface KindOptions {
  /** Matches the document's `apiVersion` field, for example "example.dev/v1". */
  apiVersion: string;
  /** Matches the document's `kind` field, for example "Pipeline". */
  kind: string;
  /** Schema for the whole document after `${…}` references are resolved. */
  schema: JsonSchema;
  /**
   * Fields that hold the id of another document. Keys are JSON Pointers into
   * this document, where `*` matches any key or list index; values are the
   * target kind name. Example: `{ "/source": "Connection" }`.
   */
  links?: Record<string, string>;
}

/** A registered kind of document. Create one with {@link defineKind}. */
export interface KindDefinition<T = unknown> {
  readonly apiVersion: string;
  readonly kind: string;
  readonly schema: JsonSchema;
  readonly links: Readonly<Record<string, string>>;
  /**
   * Only carries the document type `T` for TypeScript, so that
   * `project.all(kind)` returns typed documents. It never has a value.
   */
  readonly documentType?: T;
}

/**
 * Describes a kind of document the loader accepts. `T` is the TypeScript
 * type of a valid document; it is not checked at runtime (the schema is).
 *
 * Throws a `TypeError` straight away when the schema declares an unsupported
 * JSON Schema version, is not valid JSON Schema, or a `links` key is not a
 * JSON Pointer: these are mistakes in code, not in
 * the project being loaded.
 * @example
 * const pipeline = defineKind<Pipeline>({
 *   apiVersion: "example.dev/v1",
 *   kind: "Pipeline",
 *   schema: { type: "object", required: ["table"] },
 * });
 */
export function defineKind<T = unknown>(options: KindOptions): KindDefinition<T> {
  const name = `${options.apiVersion} ${options.kind}`;
  checkSchema(options.schema, name);
  for (const pattern of Object.keys(options.links ?? {})) {
    if (pattern === "" || parsePointer(pattern) === undefined) {
      throw new TypeError(
        `Link "${pattern}" is not a JSON Pointer such as "/source" (kind ${name}).`,
      );
    }
  }
  return Object.freeze({
    apiVersion: options.apiVersion,
    kind: options.kind,
    schema: options.schema,
    links: Object.freeze({ ...options.links }),
  });
}

function checkSchema(schema: JsonSchema, name: string): void {
  const dialect = dialectOf(schema);
  if (!dialect) {
    const declared = typeof schema === "object" ? String(schema.$schema) : "";
    throw new TypeError(
      `The schema for ${name} declares ${declared}. Supported: ${supportedDialects}.`,
    );
  }
  const validator = schemaValidators(dialect);
  if (!validator.validateSchema(schema)) {
    const reason = validator.errorsText(validator.errors);
    throw new TypeError(`The schema for ${name} is not a valid JSON Schema: ${reason}.`);
  }
}

/** Only used to check that a schema itself is well formed; one per dialect. */
const validators = new Map<Dialect, ReturnType<typeof createAjv>>();
function schemaValidators(dialect: Dialect): ReturnType<typeof createAjv> {
  let validator = validators.get(dialect);
  if (!validator) {
    validator = createAjv(dialect, { strict: false });
    validators.set(dialect, validator);
  }
  return validator;
}
