// The shapes of a `SourceMetadata` document, which mirror source-metadata.schema.yaml.

/**
 * A `SourceMetadata` document: what one connection's source holds (specification section 12.1).
 * @public
 */
export interface SourceMetadataDoc {
  /** The document's id: lowercase letters, digits and underscores. */
  id: string;
  /** The id of the Connection whose source this describes. */
  connection: string;
  /** Which environment's source was read. */
  environment?: string;
  /**
   * How the source names its objects, which decides how a flow table's `object` is matched with
   * a table here: how many parts, separated by `.`, each name has, and whether names that differ
   * only by case are different objects.
   */
  names?: { parts: number; caseSensitive: boolean };
  /** The tables of the source. */
  tables: SourceTableDoc[];
}

/**
 * One table of a `SourceMetadata` document.
 * @public
 */
export interface SourceTableDoc {
  /**
   * The table's name at the source, in as many parts as `names.parts` says, separated by `.`; it
   * may hold `/` as a file path does. A flow table's `object` is matched with it (section 12.3).
   */
  object: string;
  /** Where the table came from. */
  captured: {
    /** The time the table was captured, as an ISO 8601 timestamp. */
    at: string;
    /**
     * The rung of the ladder the table was captured from: a recipe's query or API read of the
     * source's own catalog, a document format read without a recipe, a sample of the rows of a
     * data file, a columns file, or a columns file prepared by an assistant.
     */
    from: "catalog" | "document" | "sample" | "columns" | "assistant";
    /** The recipe that read the table, when there is one. */
    recipe?: string;
    /** The file that was imported. */
    file: string;
  };
  /** The table's columns, in the source's order. */
  columns: SourceColumnDoc[];
}

/**
 * One column of a source table, with ODCS field names and values.
 * @public
 */
export interface SourceColumnDoc {
  /** The column's name at the source. */
  name: string;
  /** The type as the source states it, kept for comparing. */
  sourceType?: string;
  /** The column's ODCS logical type. */
  logicalType: string;
  /**
   * The limits of the logical type as ODCS names them, such as `precision`, `scale` or
   * `maxLength`.
   */
  logicalTypeOptions?: Record<string, unknown>;
  /** Whether the source says the column cannot be null. */
  required: boolean;
  /** The column's place in the table's primary key, from 1. */
  primaryKeyPosition?: number;
  /** The fields of a column whose logical type is `object`. */
  properties?: SourceColumnDoc[];
  /** The element of a column whose logical type is `array`. */
  items?: SourceColumnDoc;
}
