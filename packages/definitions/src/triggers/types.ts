// What a trigger is (specification sections 5.1 and 11.6): the types a standard's policy may
// allow, the triggers a flow writes and the triggers and parameters the model holds.
import type { Source } from "../diagnostics/index.js";

/**
 * The kinds of trigger a project may define: one that runs at times a recurrence gives, and
 * one that runs for each fixed, contiguous window of time.
 * @example "tumbling-window"
 * @public
 */
export type TriggerType = "schedule" | "tumbling-window";

/**
 * How often a recurrence repeats.
 * @example "Hour"
 * @public
 */
export type Frequency = "Minute" | "Hour" | "Day" | "Week" | "Month";

/**
 * A day of the week, written in full.
 * @example "Sunday"
 * @public
 */
export type Weekday =
  "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";

/**
 * A pipeline parameter a flow declares: its type, and the value a run uses when no trigger
 * sets one.
 * @example { type: "date", default: "2020-01-01" }
 * @public
 */
export interface ParameterDef {
  /** The type of the parameter's value. */
  type: "string" | "int" | "float" | "bool" | "date" | "datetime";
  /** The value used when a trigger does not set the parameter. */
  default: string | number | boolean;
}

/**
 * The value a trigger gives a parameter: a literal, or an expression the pack passes on as
 * written.
 * @example { expression: "@trigger().scheduledTime" }
 * @public
 */
export type ParameterValue = string | number | boolean | { expression: string };

/**
 * The refinements of a schedule recurrence: the minutes, hours, weekdays and days of the month
 * it starts on, and the weekday occurrences of a month.
 * @example { weekdays: ["Sunday"], hours: [2], minutes: [0] }
 * @public
 */
export interface ScheduleAt {
  /** Minutes of the hour. */
  minutes?: number[];
  /** Hours of the day. */
  hours?: number[];
  /** Days of the week. */
  weekdays?: Weekday[];
  /** Days of the month; a negative number counts from the end. */
  month_days?: number[];
  /** A weekday of the month, such as the first Monday; a negative `occurrence` counts from the end. */
  occurrences?: { day: Weekday; occurrence?: number }[];
}

/**
 * What a tumbling-window trigger waits for: its own earlier window, or another trigger's.
 * @example { self: true, offset: "-1h" }
 * @public
 */
export type TriggerDependency =
  | { self: true; offset: string; size?: string }
  | { trigger: string; offset?: string; size?: string };

/**
 * A trigger a flow writes, resolved. Options a trigger does not write are absent.
 * @example { flow: "shop", name: "hourly", type: "tumbling-window", every: { frequency: "Hour", interval: 1 }, start: "2026-12-01T00:00:00Z", timezone: "UTC", parameters: {} }
 * @public
 */
export interface ResolvedTrigger {
  /** The id of the flow that writes the trigger. */
  flow: string;
  /** The trigger's name, unique within its flow. */
  name: string;
  /** The kind of trigger. */
  type: TriggerType;
  /** How often it repeats. */
  every: { frequency: Frequency; interval: number };
  /** The first time it may start, as written. */
  start: string;
  /** The time after which it no longer starts, as written. */
  end?: string;
  /** The zone its times are in: its own, else the standard's `operations.triggers.timezone`, else UTC. */
  timezone: string;
  /** Schedule triggers: the refinements of the recurrence. */
  at?: ScheduleAt;
  /** Schedule triggers: how far back each run reads. */
  lookback?: string;
  /** Tumbling windows: how long after a window ends the run waits. */
  delay?: string;
  /** Tumbling windows: how many windows run at once. */
  concurrency?: number;
  /** Tumbling windows: how a failed window is tried again. */
  retries?: { count: number; interval: string };
  /** Tumbling windows: the triggers whose windows this one waits for. */
  depends_on?: TriggerDependency[];
  /** Tumbling windows: true to run the windows between `start` and now when the trigger is new. */
  backfill?: boolean;
  /** True when the trigger stays stopped in every environment. */
  paused?: boolean;
  /** The values it gives the pipeline's parameters. */
  parameters: Record<string, ParameterValue>;
  /** Where the trigger is written, for problems. */
  at_source: Source;
}

/**
 * A trigger as a flow writes it.
 * @example { name: "hourly", type: "schedule", every: { frequency: "Hour", interval: 1 }, start: "2026-12-01T00:00:00Z" }
 * @public
 */
export interface TriggerDoc {
  name: string;
  type: TriggerType;
  every: { frequency: Frequency; interval: number };
  start: string;
  end?: string;
  timezone?: string;
  at?: ScheduleAt;
  lookback?: string;
  delay?: string;
  concurrency?: number;
  retries?: { count: number; interval: string };
  depends_on?: TriggerDependency[];
  backfill?: boolean;
  paused?: boolean;
  parameters?: Record<string, ParameterValue>;
}

/**
 * A parameter as a flow declares it; a missing `default` is a problem the resolver reports.
 * @example { type: "date", default: "2020-01-01" }
 * @public
 */
export interface ParameterDoc {
  type: ParameterDef["type"];
  default?: ParameterDef["default"];
}
