// The shapes of a `SourceMetadata` document, which mirror source-metadata.schema.yaml.

/** A `SourceMetadata` document: what one connection's source holds (specification section 12.1). */
export interface SourceMetadataDoc {
  id: string;
  connection: string;
  environment?: string;
  names?: { parts: number; caseSensitive: boolean };
  tables: SourceTableDoc[];
}

/** One table of a `SourceMetadata` document. */
export interface SourceTableDoc {
  object: string;
  captured: {
    at: string;
    from: "catalog" | "document" | "sample" | "columns" | "assistant";
    recipe?: string;
    file: string;
  };
  columns: SourceColumnDoc[];
}

/** One column of a source table, with ODCS field names and values. */
export interface SourceColumnDoc {
  name: string;
  sourceType?: string;
  logicalType: string;
  logicalTypeOptions?: Record<string, unknown>;
  required: boolean;
  primaryKeyPosition?: number;
  properties?: SourceColumnDoc[];
  items?: SourceColumnDoc;
}
