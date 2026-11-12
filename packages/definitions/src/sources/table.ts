// A flow table's entry in its connection's source metadata (specification section 12.3).
import type { DefinitionDocument } from "@ingestron/config";
import type { Context } from "../context/index.js";
import type { FlowDoc, SourceMetadataDoc, SourceTableDoc } from "../documents/index.js";
import { writtenValue } from "../internal/index.js";
import { holdsUnsetEnvvar } from "../diagnostics/index.js";
import { matchObject, onlyReferences } from "./match.js";
import { metadataTables } from "./metadata.js";

/** What a flow table found in its connection's source metadata (specification section 12.3). */
export interface TableMatch {
  /** The connection's document. */
  document: SourceMetadataDoc;
  /** The file the document is in. */
  file: string;
  /** The one table the object matches; none for no match, or for more than one. */
  entry?: SourceTableDoc;
  /**
   * True when the object is written as one reference, or only references, with at least one
   * unset at planning: its name is not known, so it is never `SOURCE_TABLE_GONE` (section
   * 12.6) and has no `TABLE_NO_COLUMNS` (section 12.4).
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
  const { file } = found.document;
  const pointer = objectPointer(name);
  const text = writtenObject(context, flow, name, object);
  const matches = matchObject(object, text, found.tables, found.document.value.names);
  if (matches.length > 1) {
    context.reporter.error(
      "SOURCE_OBJECT_AMBIGUOUS",
      `"${object}" matches more than one table of the source metadata for "${connection}": ${matches.map((table) => table.object).join(", ")}.`,
      { document: flow, pointer },
      "Write more of the object's name, such as its schema, so that it matches one table.",
    );
    return { document, file, ambiguous: true, notKnown: false };
  }
  const notKnown = onlyReferences(text) && holdsUnsetEnvvar(context.project, object);
  return { document, file, ambiguous: false, notKnown, ...(matches[0] && { entry: matches[0] }) };
}

/**
 * True when the table's object is written only as references, at least one unset at planning,
 * so its name is not known yet (specification sections 12.4 and 12.6). It needs no metadata:
 * a table with no contract and no document for its connection is not known either.
 */
export function objectNotKnown(
  context: Context,
  flow: DefinitionDocument<FlowDoc>,
  name: string,
): boolean {
  const object = flow.value.tables[name]?.object;
  if (object === undefined || !holdsUnsetEnvvar(context.project, object)) return false;
  return onlyReferences(writtenObject(context, flow, name, object));
}

/** The JSON Pointer to a flow table's `object`. */
function objectPointer(name: string): string {
  return `/tables/${name.replaceAll("~", "~0").replaceAll("/", "~1")}/object`;
}

/**
 * The object's text as written in the flow's file, so references stay as they are there;
 * where the file cannot give it, the resolved text stands in.
 */
function writtenObject(
  context: Context,
  flow: DefinitionDocument<FlowDoc>,
  name: string,
  object: string,
): string {
  const written = writtenValue(context.files, flow.file, objectPointer(name))?.value;
  return typeof written === "string" ? written : object;
}
