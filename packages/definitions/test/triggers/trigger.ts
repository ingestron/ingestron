// A resolved trigger for the tests of start times, with the fields under test over a default.
import type { ResolvedTrigger } from "../../src/index.js";

/** A trigger with `fields` over an hourly schedule from 1 December 2026, in UTC. */
export function trigger(fields: Partial<ResolvedTrigger> = {}): ResolvedTrigger {
  return {
    flow: "shop",
    name: "t",
    type: "schedule",
    every: { frequency: "Hour", interval: 1 },
    start: "2026-12-01T00:00:00Z",
    timezone: "UTC",
    parameters: {},
    at_source: { document: {} as never, pointer: "" },
    ...fields,
  };
}
