// A connection's source metadata: the one document of the connection (specification section 12.1).
import type { DefinitionDocument } from "@ingestron/config";
import type { Context } from "../context/index.js";
import { kinds, type SourceMetadataDoc, type SourceTableDoc } from "../documents/index.js";

/**
 * Whether a source metadata document, as written, is the one for `connection`. The document of a
 * connection is the first for which this is true in the order the project loads them; an editor
 * that reads documents which may not load uses it to choose as `metadataTables` does.
 * @public
 */
export function isMetadataFor(document: { connection?: unknown }, connection: string): boolean {
  return document.connection === connection;
}

/**
 * The tables of the connection's source metadata, with the document they are in; none when
 * the project has no document for it. A second document for the connection is
 * `SOURCE_METADATA_DUPLICATE`, an error at its `connection`, and the first, in the order the
 * documents are loaded, is used. A report repeated for each table is kept once.
 */
export function metadataTables(
  context: Context,
  connection: string,
): { document: DefinitionDocument<SourceMetadataDoc>; tables: SourceTableDoc[] } | undefined {
  const [document, ...later] = context.project
    .all(kinds.sourceMetadata)
    .filter((candidate) => isMetadataFor(candidate.value, connection));
  if (!document) return undefined;
  for (const extra of later) {
    context.reporter.error(
      "SOURCE_METADATA_DUPLICATE",
      `The source metadata for "${connection}" is already in "${document.id}" (${document.file}); a connection has one document.`,
      { document: extra, pointer: "/connection" },
      "Keep one document for the connection, with all its tables.",
    );
  }
  return { document, tables: document.value.tables };
}

/** Reports a second document for any connection, whether or not a flow table reads it. */
export function checkSourceMetadata(context: Context): void {
  for (const connection of new Set(
    context.project.all(kinds.sourceMetadata).map((document) => document.value.connection),
  ))
    metadataTables(context, connection);
}
