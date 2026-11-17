// Whether the standard lets a flow write triggers (specification section 11.6).
import type { Context } from "../context/index.js";
import type { ResolvedOperations } from "../intent/index.js";
import type { TriggerDoc } from "../triggers/index.js";
import { placeIn, type Flow } from "./trigger-place.js";

/**
 * False when the standard lets the flow write no triggers at all, because of `schedule.per` or
 * `trigger`, which `TRIGGER_NOT_ALLOWED` reports once. Each trigger of a type `types` does not
 * allow is `TRIGGER_NOT_ALLOWED` too, and the rest of the flow's triggers are still checked.
 */
export function triggersAllowed(
  context: Context,
  flow: Flow,
  triggers: TriggerDoc[],
  operations: ResolvedOperations,
): boolean {
  const refuse = (message: string, hint: string, ...keys: (string | number)[]) =>
    context.reporter.error("TRIGGER_NOT_ALLOWED", message, placeIn(flow, ...keys), hint);
  if (operations.schedule.per === "project") {
    refuse(
      "The standard keeps one schedule for the project (`operations.schedule.per: project`); flows cannot write triggers.",
      "Ask for `operations.schedule.per: flow` in the standard, or take the triggers out of the flow.",
      "ingest",
      "triggers",
    );
    return false;
  }
  if (operations.trigger !== "schedule") {
    refuse(
      `The standard's \`operations.trigger\` is ${operations.trigger}, so flows cannot write schedule or tumbling-window triggers.`,
      "Take the triggers out of the flow, or ask for `operations.trigger: schedule` in the standard.",
      "ingest",
      "triggers",
    );
    return false;
  }
  const allowed = operations.triggers.types;
  triggers.forEach((trigger, index) => {
    if (allowed.includes(trigger.type)) return;
    refuse(
      `The standard allows only ${allowed.join(" and ")} triggers.`,
      `Change the trigger "${trigger.name}" to one of those types.`,
      "ingest",
      "triggers",
      index,
      "type",
    );
  });
  return true;
}
