// The operations policy as the model holds it (specification section 11.6): the standard's
// `operations` with its defaults, and its `fixed.operations` over it.
import type { OperationsDoc } from "./sections.js";

/**
 * The standard's policy for runs, with defaults filled: one schedule for the project, the
 * schedule as the trigger, an alert on failure and no required tags. Retries, timeout and
 * concurrency are absent unless the standard sets them.
 * @example { schedule: { per: "project" }, trigger: "schedule", alerts: { on: ["failure"] }, require_tags: [] }
 * @public
 */
export interface ResolvedOperations {
  /** One schedule for the project, or one per flow. */
  schedule: { per: "project" | "flow" };
  /** What starts a run. */
  trigger: "schedule" | "files" | "upstream" | "continuous";
  /** Tries again, and the wait between them. */
  retries?: { count: number; interval: string };
  /** How long a run may take before it is stopped. */
  timeout?: string;
  /** What raises an alert, and after how long a run is slow. */
  alerts: { on: ("failure" | "slow")[]; slow_after?: string };
  /** The most active runs, and whether one over the limit waits. */
  concurrency?: { max_runs: number; queue: boolean };
  /** Tags the platform must give a value for. */
  require_tags: string[];
}

/**
 * The policy in effect: the defaults, then `operations`, then `fixed`, which wins. Mappings
 * merge key by key, so a fixed `retries.count` leaves the interval the standard gave.
 * @example resolveOperations({ timeout: "2h" }, { retries: { count: 2, interval: "5m" } })
 */
export function resolveOperations(
  operations: OperationsDoc = {},
  fixed: OperationsDoc = {},
): ResolvedOperations {
  const set = withFixed(operations, fixed);
  return {
    schedule: set.schedule ?? { per: "project" },
    trigger: set.trigger ?? "schedule",
    ...(set.retries && { retries: set.retries }),
    ...(set.timeout !== undefined && { timeout: set.timeout }),
    alerts: set.alerts ?? { on: ["failure"] },
    ...(set.concurrency && { concurrency: set.concurrency }),
    require_tags: set.require_tags ?? [],
  };
}

/** The policy with what is fixed over it, key by key inside a mapping. */
function withFixed(operations: OperationsDoc, fixed: OperationsDoc): OperationsDoc {
  const set: Record<string, unknown> = { ...operations };
  for (const [key, value] of Object.entries(fixed)) {
    const earlier = set[key];
    set[key] = isMapping(earlier) && isMapping(value) ? { ...earlier, ...value } : value;
  }
  return set as OperationsDoc;
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
