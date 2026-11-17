// A misspelling in a captured source catalogue is different from having no metadata at all.
import type { DefinitionDocument } from "@ingestron/config";
import type { Reporter } from "../diagnostics/index.js";
import type { FlowDoc } from "../documents/index.js";
import { distance } from "../internal/index.js";
import { objectPointer, type TableMatch } from "./table.js";

/** Reports a known object's missing catalogue entry, with nearby imported names as fixes. */
export function unknownObject(
  reporter: Reporter,
  flow: DefinitionDocument<FlowDoc>,
  name: string,
  match: TableMatch,
): void {
  const object = flow.value.tables[name]!.object;
  const near = match.document.tables
    .map((entry) => ({
      object: entry.object,
      distance: distance(entry.object.toLowerCase(), object.toLowerCase()),
    }))
    .filter((entry) => entry.distance <= 2)
    .sort((a, b) => a.distance - b.distance || a.object.localeCompare(b.object))
    .slice(0, 3);
  reporter.error(
    "TABLE_NO_COLUMNS",
    `Source object "${object}" is not listed in the imported metadata for "${flow.value.source}" (${match.file}), and "${name}" has no contract.`,
    { document: flow, pointer: objectPointer(name) },
    near.length
      ? `Did you mean ${near.map((entry) => `"${entry.object}"`).join(" or ")}?`
      : "Choose an imported object with completion, or refresh the metadata if the source changed.",
    near.map((entry) => ({
      title: `Use source object "${entry.object}"`,
      edits: [{ file: flow.file, pointer: objectPointer(name), set: entry.object }],
    })),
  );
}
