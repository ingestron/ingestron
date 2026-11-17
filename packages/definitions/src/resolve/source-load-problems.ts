// Catalogue checks can use individually valid documents while another file is unfinished.
import type { DefinitionDocument, FileSource } from "@ingestron/config";
import { createReporter, type Diagnostic, type Reporter } from "../diagnostics/index.js";
import {
  kinds,
  type FlowDoc,
  type SourceMetadataDoc,
  type StandardDoc,
  type PlatformDoc,
} from "../documents/index.js";
import { writtenValue } from "../internal/index.js";
import { isMetadataFor, matchObject, objectPointer, unknownObject } from "../sources/index.js";

/** Additional factual checks after a failed load; never constructs a project or model. */
export function sourceLoadProblems(
  files: FileSource,
  documents: readonly DefinitionDocument[],
): Diagnostic[] {
  const reporter = createReporter();
  const flows = documents.filter(
    (doc) => doc.kind === kinds.flow.kind,
  ) as DefinitionDocument<FlowDoc>[];
  for (const flow of flows) {
    if (
      !documents.some((doc) => doc.kind === kinds.connection.kind && doc.id === flow.value.source)
    )
      continue;
    const metadata = documents.filter(
      (doc) =>
        doc.kind === kinds.sourceMetadata.kind &&
        isMetadataFor(doc.value as SourceMetadataDoc, flow.value.source),
    ) as DefinitionDocument<SourceMetadataDoc>[];
    if (metadata.length !== 1) continue;
    for (const name of Object.keys(flow.value.tables))
      checkTable(files, reporter, flow, name, metadata[0]!, breaking(documents));
  }
  return reporter.diagnostics;
}

function checkTable(
  files: FileSource,
  reporter: Reporter,
  flow: DefinitionDocument<FlowDoc>,
  name: string,
  metadata: DefinitionDocument<SourceMetadataDoc>,
  severity: "error" | "warning",
): void {
  const table = flow.value.tables[name]!;
  if (table.object.includes("${")) return;
  const written = writtenValue(files, flow.file, objectPointer(name), new Map())?.value;
  const matches = matchObject(
    table.object,
    typeof written === "string" ? written : table.object,
    metadata.value.tables,
    metadata.value.names,
  );
  if (matches.length !== 0) return;
  const match = {
    document: metadata.value,
    file: metadata.file,
    ambiguous: false,
    notKnown: false,
  };
  if (!table.contract) unknownObject(reporter, flow, name, match);
  else if (match.document.tables.some((entry) => entry.captured.from === "catalog")) {
    const at = { document: flow, pointer: objectPointer(name) };
    reporter[severity](
      "SOURCE_TABLE_GONE",
      `The source metadata for "${flow.value.source}" was read from a catalog and does not list "${table.object}".`,
      at,
      "Check the object's name, or import the source's metadata again if the table was added since.",
    );
  }
}

function breaking(documents: readonly DefinitionDocument[]): "error" | "warning" {
  const platform = documents.find((doc) => doc.kind === kinds.platform.kind)?.value as
    PlatformDoc | undefined;
  const standard = documents.find((doc) => doc.kind === kinds.standard.kind)?.value as
    StandardDoc | undefined;
  return (platform?.sources?.breaking ?? standard?.sources?.breaking) === "warn"
    ? "warning"
    : "error";
}
