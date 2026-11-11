// A flow table's entry in its connection's source metadata (specification section 12.3).
import type { DefinitionDocument } from "@ingestron/config";
import type { Context } from "../context/index.js";
import type { FlowDoc, SourceTableDoc } from "../documents/index.js";
import { writtenValue } from "../internal/index.js";
import { matchObject } from "./match.js";
import { metadataTables } from "./metadata.js";

/**
 * The metadata table of the flow table's object, or none: no document for the connection, no
 * match, or more than one, which is `SOURCE_OBJECT_AMBIGUOUS`, an error at the `object`. The
 * object's text as written is read from the flow's file, so references stay as they are
 * there; where the file cannot give it, the resolved text stands in.
 */
export function matchTable(
  context: Context,
  flow: DefinitionDocument<FlowDoc>,
  name: string,
  connection: string,
): SourceTableDoc | undefined {
  const found = metadataTables(context, connection);
  const object = flow.value.tables[name]?.object;
  if (!found || object === undefined) return undefined;
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
    return undefined;
  }
  return matches[0];
}
