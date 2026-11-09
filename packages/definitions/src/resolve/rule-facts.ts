// A table's facts for rules: what it is, what it declares as intent and what governance says of it.
import type { DefinitionDocument } from "@ingestron/config";
import { intentFacts, tableFacts, type Facts } from "../choose/index.js";
import type { Context } from "../context/index.js";
import type { FlowDoc, TransformDoc } from "../documents/index.js";
import { flowIntent, transformIntent, type TableIntent } from "./declared-intent.js";

/** A table's facts for rules, and its declared intent, which they come from. */
export interface RuleFacts {
  facts: Facts;
  declared: TableIntent;
}

/**
 * A flow table's facts: its connection's and layer (`own`), the load mode and history it
 * declares, and its contract's. Declared intent is resolved first, before any method is chosen.
 */
export function flowFacts(
  context: Context,
  flow: DefinitionDocument<FlowDoc>,
  name: string,
  own: Facts,
): RuleFacts {
  const declared = flowIntent(context, flow, name, own);
  const contract = flow.value.tables[name]!.contract;
  return {
    declared,
    facts: { ...own, ...intentFacts(declared.intent), ...tableFacts(context, contract) },
  };
}

/** A transform table's facts: its layer, the history it declares (no load mode) and its contract's. */
export function transformFacts(
  context: Context,
  doc: DefinitionDocument<TransformDoc>,
  layer: string,
): RuleFacts {
  const declared = transformIntent(context, doc, layer);
  const facts = {
    layer,
    ...intentFacts(declared.intent),
    ...tableFacts(context, doc.value.contract),
  };
  return { declared, facts };
}
