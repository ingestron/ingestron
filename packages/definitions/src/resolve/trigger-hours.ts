// The hours in which the standard lets a trigger start a run (specification section 11.6).
import type { Context } from "../context/index.js";
import {
  clockTime,
  cycleOf,
  outsideHours,
  type Hours,
  type ResolvedTrigger,
} from "../triggers/index.js";

/**
 * `TRIGGER_HOURS` for each trigger with a start outside `hours`, or whose start times cannot be
 * checked, an error at the trigger. Nothing when the standard gives no hours.
 */
export function checkHours(context: Context, triggers: ResolvedTrigger[], hours?: Hours): void {
  if (!hours) return;
  for (const trigger of triggers) {
    if (cycleOf(trigger) === undefined) {
      context.reporter.error(
        "TRIGGER_HOURS",
        "Ingestron cannot check this schedule's start times; write a shorter cycle.",
        trigger.at_source,
        "Give it fewer days or times, so that a cycle of its recurrence has at most 200,000 starts.",
      );
      continue;
    }
    const found = outsideHours(trigger, hours);
    if (!found) continue;
    context.reporter.error(
      "TRIGGER_HOURS",
      `"${trigger.name}" starts a run at ${clockTime(found, hours.timezone)} (${hours.timezone}), outside the hours the standard allows here: ${hours.from}–${hours.to}.`,
      trigger.at_source,
      "Start its runs inside those hours, or ask for the standard's `operations.triggers.hours` to allow them.",
    );
  }
}
