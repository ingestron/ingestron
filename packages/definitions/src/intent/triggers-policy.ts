// The triggers policy as the model holds it (specification section 11.6): the standard's
// `operations.triggers` with its defaults, the selected environment's entry over it, and
// `fixed.operations.triggers` over both.
import type { TriggerType } from "../triggers/index.js";
import type { HoursDoc, TriggersPolicyDoc, TriggersValuesDoc } from "./sections.js";

/**
 * What triggers may be: the types, the zone their times are in and, when the standard limits
 * them, the hours in which one may start.
 * @example { types: ["schedule"], timezone: "Europe/London", hours: { from: "22:00", to: "06:00", timezone: "Europe/London" } }
 * @public
 */
export interface ResolvedTriggers {
  /** The trigger types a project may define. */
  types: TriggerType[];
  /** The zone trigger times are in. */
  timezone: string;
  /** The hours in which a trigger may start; absent when any hour will do. */
  hours?: { from: string; to: string; timezone: string };
}

/** The values as layered, before the hours take the zone they were not given. */
interface Layered {
  types: TriggerType[];
  timezone: string;
  hours?: HoursDoc;
}

const defaults: Layered = { types: ["schedule", "tumbling-window"], timezone: "UTC" };

/**
 * The policy in effect for `environment`: the defaults, then the standard's values and its
 * entry for the environment, then the fixed values and their entry for it. A key an entry
 * gives replaces the earlier one; `hours: any` removes the hours.
 * @example resolveTriggers({ timezone: "Europe/London" }, undefined, "dev")
 */
export function resolveTriggers(
  policy?: TriggersPolicyDoc,
  fixed?: TriggersPolicyDoc,
  environment?: string,
): ResolvedTriggers {
  const layered = [policy, fixed].reduce(
    (base: Layered, doc) => layer(base, doc, environment),
    defaults,
  );
  const { hours, ...rest } = layered;
  return {
    ...rest,
    ...(hours && { hours: { ...hours, timezone: hours.timezone ?? layered.timezone } }),
  };
}

/** The values with a document's common keys over them, then its entry for the environment. */
function layer(base: Layered, doc?: TriggersPolicyDoc, environment?: string): Layered {
  if (!doc) return base;
  const entry = environment === undefined ? undefined : doc.environments?.[environment];
  return replace(replace(base, doc), entry);
}

/** The values with each key the entry gives over them. */
function replace(base: Layered, entry?: TriggersValuesDoc): Layered {
  if (!entry) return base;
  const { hours, ...rest } = base;
  const next = entry.hours === undefined ? hours : entry.hours;
  return {
    ...rest,
    ...(entry.types && { types: entry.types }),
    ...(entry.timezone !== undefined && { timezone: entry.timezone }),
    ...(next && next !== "any" && { hours: next }),
  };
}
