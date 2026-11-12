// Source recipes: how to get one kind of source's metadata. The rules are in
// spec/cli/sources.md, section 1.

/**
 * The readers a recipe names (specification, section 2).
 * @public
 */
export type SourceReaderName =
  | "columns"
  | "sample"
  | "odcs"
  | "odata"
  | "openapi"
  | "json-schema"
  | "avro"
  | "salesforce-describe";

/**
 * The fields of the columns file a recipe's `fields` can map.
 * @public
 */
export type ColumnsField =
  | "table_catalog"
  | "table_schema"
  | "table_name"
  | "column_name"
  | "ordinal_position"
  | "data_type"
  | "is_nullable"
  | "primary_key_position";

/**
 * What the source request asks for.
 * @public
 */
export interface SourceAsk {
  /** Who should do it. */
  who: string;
  /** The permission it needs. */
  access: string;
  /** A query; a `catalog` or `document` recipe has this or `call`, a `sample` recipe neither. */
  run?: string;
  /** A URL to call. */
  call?: string;
  /** Where to save the result, starting `sources/`. */
  save: string;
  /** How to save it, such as with `curl`. */
  how?: string;
}

/**
 * One rule that maps a source's type to a logical type.
 * @public
 */
export interface SourceTypeRule {
  /** A regular expression, applied without case to the source's type as written. */
  match: string;
  /** An ODCS logical type. */
  logicalType: string;
  /** The logical type's options; `$1`, `$2` and so on are capture groups of `match`. */
  options?: Record<string, string | number>;
}

/**
 * A source recipe, read from `recipes/<id>.yaml`.
 * @public
 */
export interface SourceRecipe {
  /** Lower-case letters, digits and `-`; the file's name without `.yaml`. */
  id: string;
  /** The source's name. */
  title: string;
  /** `catalog`: a query or API call on the source's catalog; `document`: a published document; `sample`: a file of what the source sends. */
  kind: "catalog" | "document" | "sample";
  /** Each input's name and what to write for it; a connection gives the values in `metadata.with`. */
  inputs: Record<string, { description: string }>;
  /** What the request asks for. */
  ask: SourceAsk;
  /** The reader that reads the result. */
  read: SourceReaderName;
  /** How the source names a table, as the metadata document's `names`. */
  names?: { parts: number; caseSensitive: boolean };
  /** The source's types, as rules tried in order. */
  types: SourceTypeRule[];
  /** With `columns` and `sample`: the path of keys, joined with `.`, to the records of a JSON result. */
  rows?: string;
  /** With `columns`: the result's field that holds each field of the columns file; `!` reads a true-or-false field the other way round. */
  fields?: Partial<Record<ColumnsField, string>>;
  /** With `columns`: the columns that form each table's primary key, in order. */
  key?: string[];
  /**
   * Renames each column of a table: `match` is a regular expression, applied without case to the
   * name, and `to` the new name, with `$1`, `$2` and so on for the capture groups of `match`.
   */
  columnNames?: { match: string; to: string };
  /** With `odata`: `sets` names a table after its entity set, `types` after its entity type. */
  objects?: "sets" | "types";
  /** The vendor documentation the recipe comes from, each with the date it was read. */
  sources: { url: string; read: string }[];
  /** The file the recipe was read from, as given to `readSourceRecipe`. */
  file: string;
}

/** Every reader a recipe may name, in the order the specification lists them. */
export const readerNames: readonly SourceReaderName[] = [
  "columns",
  "sample",
  "odcs",
  "odata",
  "openapi",
  "json-schema",
  "avro",
  "salesforce-describe",
];

/** Every field of the columns file, in the order the specification lists them. */
export const columnsFields: readonly ColumnsField[] = [
  "table_catalog",
  "table_schema",
  "table_name",
  "column_name",
  "ordinal_position",
  "data_type",
  "is_nullable",
  "primary_key_position",
];

/** The ODCS logical types a recipe's type rules may give. */
export const logicalTypes = [
  "string",
  "date",
  "timestamp",
  "time",
  "number",
  "integer",
  "object",
  "array",
  "boolean",
] as const;
