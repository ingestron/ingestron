// The source tables of a resolution: each flow table with the entry of its connection's
// source metadata, for the tool that imports metadata or drafts a contract (specification
// section 12.7).
import type { DefinitionDocument } from "@ingestron/config";
import type { Context } from "../context/index.js";
import type { FlowDoc } from "../documents/index.js";
import { metadataTypes, type SourceTable, type TableMatch } from "../sources/index.js";
import { contractNeeded } from "./contract-needed.js";
import type { FlowSteps } from "./flow-sources.js";

/** The flow table that is listed, and what is known of it so far. */
export interface ListedTable {
  flow: DefinitionDocument<FlowDoc>;
  name: string;
  /** The table's layer; undefined when it cannot be resolved. */
  layer: string | undefined;
  /** What the table's object matched in its connection's source metadata. */
  match: TableMatch | undefined;
}

/**
 * The reason the table needs a contract, as far as its steps are known (section 12.5); none
 * when it does not, or when its layer cannot be resolved.
 */
export function needsOf(
  context: Context,
  { flow, name, layer }: ListedTable,
  steps: Partial<FlowSteps> | undefined,
): string | undefined {
  if (!layer) return undefined;
  const expectations = (flow.value.tables[name]!.expectations ?? []).length > 0;
  return contractNeeded(context, { layer, steps, expectations });
}

/** The flow table's item of the list (section 12.7). */
export function sourceTableOf(
  context: Context,
  { flow, name, match }: ListedTable,
  needs: string | undefined,
): SourceTable {
  const doc = flow.value.tables[name]!;
  return {
    flow: flow.value.id,
    table: name,
    connection: flow.value.source,
    object: doc.object,
    ...(doc.contract !== undefined && { contract: doc.contract }),
    ...(needs !== undefined && { needs }),
    ...(match && metadataOf(context, match)),
  };
}

/** What the item says of the metadata the table's object matched: its entry, names, file, types. */
function metadataOf(context: Context, match: TableMatch): Partial<SourceTable> {
  const names = match.document.names;
  const types = match.entry && metadataTypes(context, match.entry);
  return {
    ...(match.entry && { entry: match.entry }),
    ...(names && { names }),
    file: match.file,
    ...(types && { types }),
  };
}
