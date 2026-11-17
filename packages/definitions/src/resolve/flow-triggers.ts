// A flow's triggers and parameters as the model holds them (specification section 5.1).
import type { Context } from "../context/index.js";
import type { ResolvedOperations } from "../intent/index.js";
import type { ParameterDef, ResolvedTrigger, TriggerDoc } from "../triggers/index.js";
import { checkHours } from "./trigger-hours.js";
import { checkOptions } from "./trigger-options.js";
import { checkDeclarations, checkValues } from "./trigger-parameters.js";
import { triggersAllowed } from "./trigger-rights.js";
import { placeIn, type Flow } from "./trigger-place.js";
import { checkZoneName } from "./timezones.js";

/** What a flow's table carries of its flow's triggers and parameters: empty when it writes none. */
export interface FlowTriggers {
  triggers: ResolvedTrigger[];
  parameters: Record<string, ParameterDef>;
}

/** The trigger as the model holds it: the options as written, and its zone settled. */
function resolved(flow: Flow, doc: TriggerDoc, index: number, zone: string): ResolvedTrigger {
  const { timezone, parameters, ...rest } = doc;
  return {
    flow: flow.value.id,
    ...rest,
    timezone: timezone ?? zone,
    parameters: { ...parameters },
    at_source: placeIn(flow, "ingest", "triggers", index),
  };
}

/**
 * The triggers and parameters of `flow`, checked as section 5.1 says. A trigger takes the zone
 * it writes, else the one in `operations.triggers`. A flow whose triggers the standard does not
 * allow resolves none; those it allows are checked against the standard's hours. Problems are
 * reported once, however many tables the flow has.
 */
export function resolveFlowTriggers(
  context: Context,
  flow: Flow,
  operations: ResolvedOperations,
): FlowTriggers {
  const parameters = checkDeclarations(context, flow);
  const docs = flow.value.ingest?.triggers ?? [];
  if (docs.length === 0 || !triggersAllowed(context, flow, docs, operations))
    return { triggers: [], parameters };
  checkOptions(context, flow, docs);
  const declared = flow.value.ingest?.parameters ?? {};
  docs.forEach((doc, index) => {
    if (doc.timezone !== undefined)
      checkZoneName(context, doc.timezone, placeIn(flow, "ingest", "triggers", index, "timezone"));
    checkValues(context, flow, doc, index, declared);
  });
  const zone = operations.triggers.timezone;
  const triggers = docs.map((doc, index) => resolved(flow, doc, index, zone));
  checkHours(context, triggers, operations.triggers.hours);
  return { triggers, parameters };
}
