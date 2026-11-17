// The options of a flow's triggers (specification section 5.1): which type each belongs to,
// names that are unique, and the triggers a tumbling window depends on.
import type { Context } from "../context/index.js";
import { kinds } from "../documents/index.js";
import { clockOf, readStart, type TriggerDoc, type TriggerType } from "../triggers/index.js";
import { placeIn, type Flow } from "./trigger-place.js";

/** The options only one type of trigger has. */
const optionsOf: Record<TriggerType, (keyof TriggerDoc)[]> = {
  schedule: ["at", "lookback"],
  "tumbling-window": ["delay", "concurrency", "retries", "depends_on", "backfill"],
};

/** `TRIGGER_OPTION` for each option on a trigger of the other type, an error at the option. */
function checkTypeOptions(context: Context, flow: Flow, trigger: TriggerDoc, index: number): void {
  const other: TriggerType = trigger.type === "schedule" ? "tumbling-window" : "schedule";
  for (const option of optionsOf[other].filter((key) => trigger[key] !== undefined))
    context.reporter.error(
      "TRIGGER_OPTION",
      `The trigger "${trigger.name}" is a ${trigger.type} trigger, so it cannot have ${option}.`,
      placeIn(flow, "ingest", "triggers", index, option),
      `Only a ${other} trigger has ${option}.`,
    );
}

/** `TRIGGER_OPTION` for `at` on a schedule by the minute or hour, which runs from its start. */
function checkAt(context: Context, flow: Flow, trigger: TriggerDoc, index: number): void {
  const { frequency } = trigger.every;
  if (trigger.type !== "schedule" || trigger.at === undefined) return;
  if (frequency !== "Minute" && frequency !== "Hour") return;
  context.reporter.error(
    "TRIGGER_OPTION",
    `"${trigger.name}" runs every ${frequency}; \`at\` applies only to Day, Week and Month schedules. To run at a given minute, start the trigger at that minute.`,
    placeIn(flow, "ingest", "triggers", index, "at"),
  );
}

/** `TRIGGER_OPTION` for `at` with both `month_days` and `occurrences`, an error at `at`. */
function checkMonthDays(context: Context, flow: Flow, trigger: TriggerDoc, index: number): void {
  if (trigger.at?.month_days === undefined || trigger.at.occurrences === undefined) return;
  context.reporter.error(
    "TRIGGER_OPTION",
    `"${trigger.name}" gives both month_days and occurrences; give one of them.`,
    placeIn(flow, "ingest", "triggers", index, "at"),
    "Keep `month_days` for days of the month, or `occurrences` for weekdays of the month.",
  );
}

/** `TRIGGER_OPTION` for a `start` or `end` that cannot be read as a date and time, at the value. */
function checkTimes(context: Context, flow: Flow, trigger: TriggerDoc, index: number): void {
  const utc = clockOf("UTC");
  for (const key of ["start", "end"] as const) {
    const value = trigger[key];
    if (value === undefined || readStart(value, utc)) continue;
    context.reporter.error(
      "TRIGGER_OPTION",
      `"${trigger.name}" has ${key === "start" ? "a start" : "an end"} Ingestron cannot read: "${value}". Write it as 2026-12-01T02:30:00, with Z or an offset for a fixed instant.`,
      placeIn(flow, "ingest", "triggers", index, key),
      "Write the date and time as YYYY-MM-DDTHH:mm:ss, on the calendar and the clock.",
    );
  }
}

/** The tumbling-window triggers of the project, by `<flow>/<name>`. */
function tumblingWindows(context: Context): Set<string> {
  const found = context.project
    .all(kinds.flow)
    .flatMap((flow) =>
      (flow.value.ingest?.triggers ?? [])
        .filter((trigger) => trigger.type === "tumbling-window")
        .map((trigger) => `${flow.value.id}/${trigger.name}`),
    );
  return new Set(found);
}

/** `TRIGGER_OPTION` for each dependency that names no tumbling-window trigger of the project. */
function checkDependencies(
  context: Context,
  flow: Flow,
  trigger: TriggerDoc,
  index: number,
  known: Set<string>,
): void {
  (trigger.depends_on ?? []).forEach((dependency, at) => {
    if (!("trigger" in dependency)) return;
    const name = dependency.trigger.includes("/")
      ? dependency.trigger
      : `${flow.value.id}/${dependency.trigger}`;
    if (known.has(name)) return;
    context.reporter.error(
      "TRIGGER_OPTION",
      `The trigger "${trigger.name}" depends on "${dependency.trigger}", which is not a tumbling-window trigger of the project.`,
      placeIn(flow, "ingest", "triggers", index, "depends_on", at, "trigger"),
      "Name a tumbling-window trigger of this flow, or write `<flow>/<name>` for another flow's.",
    );
  });
}

/**
 * Reports each trigger name used twice in the flow, each option on the wrong type, a start or
 * end that cannot be read, `at` on a schedule by the minute or hour, `at` with both month days
 * and occurrences, and each dependency on no tumbling window of the project, as `TRIGGER_OPTION`.
 */
export function checkOptions(context: Context, flow: Flow, triggers: TriggerDoc[]): void {
  const names = new Set<string>();
  const known = tumblingWindows(context);
  triggers.forEach((trigger, index) => {
    if (names.has(trigger.name))
      context.reporter.error(
        "TRIGGER_OPTION",
        `The trigger name "${trigger.name}" is used twice in the flow "${flow.value.id}".`,
        placeIn(flow, "ingest", "triggers", index, "name"),
        "Give each trigger of a flow its own name.",
      );
    names.add(trigger.name);
    checkTypeOptions(context, flow, trigger, index);
    checkTimes(context, flow, trigger, index);
    checkAt(context, flow, trigger, index);
    checkMonthDays(context, flow, trigger, index);
    if (trigger.type === "tumbling-window") checkDependencies(context, flow, trigger, index, known);
  });
}
