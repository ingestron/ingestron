// A flow table's entry in its connection's source metadata (specification section 12.3).
import type { DefinitionDocument } from "@ingestron/config";
import type { Context } from "../context/index.js";
import type { FlowDoc, SourceMetadataDoc, SourceTableDoc } from "../documents/index.js";
import { writtenValue } from "../internal/index.js";
import { holdsUnsetEnvvar } from "../diagnostics/index.js";
import { isReference, matchObject } from "./match.js";
import { metadataTables } from "./metadata.js";

/** What a flow table found in its connection's source metadata (specification section 12.3). */
export interface TableMatch {
  /** The connection's document. */
  document: SourceMetadataDoc;
  /** The one table the object matches; none for no match, or for more than one. */
  entry?: SourceTableDoc;
  /**
   * True when the object is written as one reference that is unset at planning: its name is
   * not known, so it is never `SOURCE_TABLE_GONE` (specification section 12.6).
   */
  notKnown: boolean;
  /** True when more than one table matched, which `SOURCE_OBJECT_AMBIGUOUS` has reported. */
  ambiguous: boolean;
}

/**
 * What the flow table's object matches in its connection's source metadata: nothing when the
 * connection has no document, else its document with the metadata table the object matches,
 * none when no table or more than one matches (more than one is `SOURCE_OBJECT_AMBIGUOUS`,
 * an error at the `object`). The object's text as written is read from the flow's file, so
 * references stay as they are there; where the file cannot give it, the resolved text stands
 * in.
 */
export function matchTable(
  context: Context,
  flow: DefinitionDocument<FlowDoc>,
  name: string,
  connection: string,
): TableMatch | undefined {
  const found = metadataTables(context, connection);
  const object = flow.value.tables[name]?.object;
  if (!found || object === undefined) return undefined;
  const document = found.document.value;
  const pointer = `/tables/${name.replaceAll("~", "~0").replaceAll("/", "~1")}/object`;
  const written = writtenValue(context.files, flow.file, pointer)?.value;
  const matches = matchObject(
    object,
    typeof written === "string" ? written : object,
    found.tables,
    found.document.value.names,
  );
  if (matches.length > 1) {
    context.reporter.error(
      "SOURCE_OBJECT_AMBIGUOUS",
      `"${object}" matches more than one table of the source metadata for "${connection}": ${matches.map((table) => table.object).join(", ")}.`,
      { document: flow, pointer },
      "Write more of the object's name, such as its schema, so that it matches one table.",
    );
    return { document, ambiguous: true, notKnown: false };
  }
  const text = typeof written === "string" ? written : object;
  const notKnown = isReference(text) && holdsUnsetEnvvar(context.project, object);
  return { document, ambiguous: false, notKnown, ...(matches[0] && { entry: matches[0] }) };
}
