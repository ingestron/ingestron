// A flow table's contract and its own expectations, which are not applied when the table
// ends at the landed files (specification section 6).
import type { DefinitionDocument } from "@ingestron/config";
import type { Context } from "../context/index.js";
import { contractFor, expectationsNotChecked } from "../contracts/index.js";
import type { FlowDoc, SourceTableDoc } from "../documents/index.js";
import type { Contract } from "../pack/index.js";
import { compareWithContract, metadataContract, type TableMatch } from "../sources/index.js";
import { contractNeeded } from "./contract-needed.js";
import type { FlowSteps } from "./flow-sources.js";

type Flow = DefinitionDocument<FlowDoc>;

/**
 * The flow table's contract; a table that ends at the landed files checks nothing, which is
 * reported on the ingest step's pack. A table with none takes its columns and key from its
 * source metadata entry of `match`, found by `matchTable` (section 12.4); with neither it has
 * no columns, which is `TABLE_NO_COLUMNS`. A table that needs a contract (section 12.5) is
 * `CONTRACT_NEEDED` instead, whether or not it has an entry. A table with a contract is
 * compared with its entry, or with the lack of one (section 12.6).
 */
export function flowContract(
  context: Context,
  flow: Flow,
  name: string,
  steps: Partial<FlowSteps> | undefined,
  match: TableMatch | undefined,
  layer: string,
): Contract | undefined {
  const doc = flow.value.tables[name]!;
  const atFiles = steps?.endsAtFiles !== undefined ? steps.ingest?.pack : undefined;
  const at = (field: string) => ({ document: flow, pointer: `/tables/${name}/${field}` });
  if (atFiles !== undefined)
    expectationsNotChecked(context, doc.expectations ?? [], at("expectations"), atFiles);
  if (doc.contract === undefined)
    return withoutContract(context, flow, name, { steps, match, layer });
  const contract = contractFor(context, name, doc.contract, at("contract"), {
    atFiles,
    keeper: keeperOf(steps),
  });
  if (contract) compareWithContract(context, flow, name, doc.contract, match);
  return contract;
}

/** The contract of a table that names none: from its metadata, or `CONTRACT_NEEDED` or `TABLE_NO_COLUMNS`. */
function withoutContract(
  context: Context,
  flow: Flow,
  name: string,
  {
    steps,
    match,
    layer,
  }: { steps: Partial<FlowSteps> | undefined; match?: TableMatch; layer: string },
): Contract | undefined {
  const expectations = (flow.value.tables[name]?.expectations ?? []).length > 0;
  const reason = contractNeeded(context, { layer, steps, expectations });
  return reason === undefined
    ? fromMetadata(context, flow, name, match?.entry)
    : reportNeeded(context, flow, name, reason);
}

/** `CONTRACT_NEEDED` at the table: it names no contract, and `reason` says why it needs one. */
function reportNeeded(context: Context, flow: Flow, name: string, reason: string): undefined {
  context.reporter.error(
    "CONTRACT_NEEDED",
    `"${name}" needs a contract: ${reason}.`,
    { document: flow, pointer: `/tables/${name}` },
    "Name a contract for the table with `contract`.",
  );
  return undefined;
}

/** The contract of a table that names none: made from its metadata entry, else reported. */
function fromMetadata(
  context: Context,
  flow: Flow,
  name: string,
  entry: SourceTableDoc | undefined,
): Contract | undefined {
  if (entry) return metadataContract(context, flow.value.source, entry);
  context.reporter.error(
    "TABLE_NO_COLUMNS",
    `"${name}" has no contract and no source metadata, so it has no columns.`,
    { document: flow, pointer: `/tables/${name}` },
    "Import the source's metadata (ingestron source request says how), or name a contract.",
  );
  return undefined;
}

/** The pack that keeps the table: its store's, else that of an ingest step that writes a table. */
function keeperOf(steps: Partial<FlowSteps> | undefined): string | undefined {
  if (steps?.store) return steps.store.pack;
  return steps?.ingest?.produces === "table" ? steps.ingest.pack : undefined;
}
