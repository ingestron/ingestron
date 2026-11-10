// A flow table's contract and its own expectations, which are not applied when the table
// ends at the landed files (specification section 6).
import type { DefinitionDocument } from "@ingestron/config";
import type { Context } from "../context/index.js";
import { contractFor, expectationsNotChecked } from "../contracts/index.js";
import type { FlowDoc } from "../documents/index.js";
import type { Contract } from "../pack/index.js";
import type { FlowSteps } from "./flow-sources.js";

type Flow = DefinitionDocument<FlowDoc>;

/**
 * The flow table's contract; a table that ends at the landed files checks nothing, which is
 * reported on the ingest step's pack.
 */
export function flowContract(
  context: Context,
  flow: Flow,
  name: string,
  steps: Partial<FlowSteps> | undefined,
): Contract | undefined {
  const doc = flow.value.tables[name]!;
  const atFiles = steps?.endsAtFiles !== undefined ? steps.ingest?.pack : undefined;
  const at = (field: string) => ({ document: flow, pointer: `/tables/${name}/${field}` });
  if (atFiles !== undefined)
    expectationsNotChecked(context, doc.expectations ?? [], at("expectations"), atFiles);
  return contractFor(context, name, doc.contract, at("contract"), {
    atFiles,
    keeper: keeperOf(steps),
  });
}

/** The pack that keeps the table: its store's, else that of an ingest step that writes a table. */
function keeperOf(steps: Partial<FlowSteps> | undefined): string | undefined {
  if (steps?.store) return steps.store.pack;
  return steps?.ingest?.produces === "table" ? steps.ingest.pack : undefined;
}
