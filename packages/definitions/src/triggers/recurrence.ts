// The run start times of a trigger over one full cycle of its recurrence (specification section
// 11.6), as ADF starts them: exact, never sampled.
import { isZone } from "../zones/index.js";
import { durationMs } from "./duration.js";
import type { ResolvedTrigger } from "./types.js";
import { wallStarts } from "./wall-clock.js";
import { addMonths, clockOf, DAY, type Clock } from "./zone.js";

const MINUTE = 60_000;

/** The most starts a cycle may have and still be checked. */
const MAX_STARTS = 200_000;

/** The length of each frequency but the month, in minutes. */
const minutesOf = { Minute: 1, Hour: 60, Day: 1440, Week: 10_080 } as const;

/** A trigger's starts over one cycle, as instants (milliseconds since the epoch). */
export interface Cycle {
  /** The trigger's start. */
  start: number;
  starts: number[];
  /** The first start of the next cycle. */
  next: number;
  /** For starts fixed in UTC: the length of the cycle, when it is a fixed length. */
  period?: number;
  /** For wall-clock starts: the start, and the end of the cycle, as wall-clock times. */
  wall?: { start: number; until: number };
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;
const range = (count: number) => Array.from({ length: count }, (_, index) => index);

/** True when the date and time written at the start of `dated` are on the calendar and clock. */
function onCalendar(dated: string): boolean {
  const found = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(dated);
  if (!found) return false;
  type Parts = [number, number, number, number, number, number];
  const [year, month, day, hour, minute, second] = found
    .slice(1)
    .map((part) => Number(part ?? 0)) as Parts;
  const at = new Date(Date.UTC(year, month - 1, day));
  const real = at.getUTCMonth() === month - 1 && at.getUTCDate() === day;
  return real && hour < 24 && minute < 60 && second < 60;
}

/**
 * A trigger's start or end as written, as an instant and as a wall-clock time in `clock`'s zone
 * (its date and time read as UTC). With `Z` or an offset (`+01:00`, `+0100` or `+01`) it is an
 * instant; without one, a wall-clock time in the zone, read as `clock.instant` reads it. A date
 * alone is its midnight. Undefined when it cannot be read, or its date or time is not on the
 * calendar or the clock (such as 30 February, or hour 24).
 * @example readStart("2026-12-01T02:00:00", clockOf("Europe/London")) // { instant: 1796090400000, wall: 1796090400000 }
 * @public
 */
export function readStart(
  start: string,
  clock: Clock,
): { instant: number; wall: number } | undefined {
  const dated = start.includes("T") ? start : `${start}T00:00:00`;
  if (!onCalendar(dated)) return undefined;
  if (/(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(dated)) {
    // `+0100` and `+01` are read as `+01:00`, which every engine parses.
    const instant = Date.parse(
      dated.replace(/([+-]\d{2}):?(\d{2})?$/, (_, hours, minutes) => `${hours}:${minutes ?? "00"}`),
    );
    return Number.isNaN(instant) ? undefined : { instant, wall: instant + clock.offset(instant) };
  }
  const wall = Date.parse(`${dated}Z`);
  return Number.isNaN(wall) ? undefined : { instant: clock.instant(wall), wall };
}

/** Starts every `minutes` from `first`, over the least common multiple of it and a day. */
function repeated(start: number, first: number, minutes: number): Cycle {
  const period = lcm(minutes, 1440) * MINUTE;
  const at = (index: number) => first + index * minutes * MINUTE;
  const count = period / (minutes * MINUTE);
  return { start, starts: range(count).map(at), next: at(count), period };
}

/** A tumbling window's runs: each window's end plus the delay, over one cycle. */
function windows(trigger: ResolvedTrigger, start: number): Cycle {
  const { frequency, interval } = trigger.every;
  const delay = durationMs(trigger.delay ?? "0s") ?? 0;
  if (frequency !== "Month")
    return repeated(
      start,
      start + interval * minutesOf[frequency] * MINUTE + delay,
      interval * minutesOf[frequency],
    );
  const at = (index: number) => addMonths(start, (index + 1) * interval) + delay;
  return { start, starts: range(12).map(at), next: at(12) };
}

/** The wall-clock time one cycle after `wall`. */
function cycleAfter(trigger: ResolvedTrigger, wall: number): number {
  const { frequency, interval } = trigger.every;
  if (frequency === "Month") return addMonths(wall, lcm(interval, 12) * 4);
  return wall + interval * (frequency === "Week" ? 7 : 1) * DAY;
}

/**
 * A schedule by the day, week or month; undefined past the most starts. The next start is the
 * first the recurrence gives after the cycle.
 */
function wallCycle(
  trigger: ResolvedTrigger,
  start: { instant: number; wall: number },
  clock: Clock,
) {
  const until = cycleAfter(trigger, start.wall);
  const walls: number[] = [];
  let next = Number.NaN;
  for (const wall of wallStarts(trigger, start.wall, cycleAfter(trigger, until))) {
    if (wall >= until) {
      next = clock.instant(wall);
      break;
    }
    walls.push(wall);
    if (walls.length > MAX_STARTS) return undefined;
  }
  const starts = walls.map((wall) => clock.instant(wall));
  return { start: start.instant, starts, next, wall: { start: start.wall, until } };
}

/**
 * The longest gap between the real instants of a wall-clock schedule's runs over a year and at
 * least one cycle, and into the next run, so that each change of clocks is measured.
 */
function wallGap(trigger: ResolvedTrigger, wall: { start: number; until: number }): number {
  const clock = clockOf(trigger.timezone);
  const until = Math.max(wall.until, wall.start + 366 * DAY);
  let longest = 0;
  let previous: number | undefined;
  for (const start of wallStarts(trigger, wall.start, cycleAfter(trigger, until))) {
    const at = clock.instant(start);
    if (previous !== undefined) longest = Math.max(longest, at - previous);
    previous = at;
    if (start >= until) break;
  }
  return longest;
}

/**
 * The trigger's cycle: undefined when it has more than 200,000 starts, null when its start,
 * zone or interval cannot be read.
 */
export function cycleOf(trigger: ResolvedTrigger): Cycle | undefined | null {
  const { frequency, interval } = trigger.every;
  if (!isZone(trigger.timezone) || !Number.isInteger(interval) || interval < 1) return null;
  const clock = clockOf(trigger.timezone);
  const start = readStart(trigger.start, clock);
  if (!start) return null;
  if (trigger.type === "tumbling-window") return windows(trigger, start.instant);
  if (frequency === "Minute" || frequency === "Hour")
    return repeated(start.instant, start.instant, interval * minutesOf[frequency]);
  return wallCycle(trigger, start, clock);
}

/**
 * Every run start, in UTC, from `trigger` within one full cycle; undefined when the cycle
 * cannot be bounded (more than 200,000 starts). None when its start or zone cannot be read.
 * @example cycleStarts(trigger) // 24 dates for an hourly schedule
 * @public
 */
export function cycleStarts(trigger: ResolvedTrigger): Date[] | undefined {
  const cycle = cycleOf(trigger);
  if (cycle === undefined) return undefined;
  return (cycle?.starts ?? []).map((start) => new Date(start));
}

/**
 * The longest gap in milliseconds between consecutive starts over one cycle and into the next;
 * for a schedule by the day, week or month, between the real instants over the year from its
 * start and at least one cycle, so a change of clocks counts. Undefined when the cycle cannot
 * be bounded or has no starts.
 * @example longestGap(trigger) // 43200000 for a daily schedule at 06:00 and 18:00
 * @public
 */
export function longestGap(trigger: ResolvedTrigger): number | undefined {
  const cycle = cycleOf(trigger);
  if (!cycle || cycle.starts.length === 0) return undefined;
  if (cycle.wall) return wallGap(trigger, cycle.wall);
  const all = [...cycle.starts, cycle.next];
  return Math.max(...all.slice(1).map((start, index) => start - (all[index] as number)));
}
