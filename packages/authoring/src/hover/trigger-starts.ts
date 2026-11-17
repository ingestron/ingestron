// The next run starts of a trigger after a moment: its first cycle of starts from the definitions
// package, then the same cycle again from its start moved on by whole cycles, never sampled. A
// monthly tumbling window adds each whole number of months to its own start, clamping each time.
import { clockOf, cycleStarts, readStart, type ResolvedTrigger } from "@ingestron/definitions";

const MINUTE = 60_000;
const DAY = 86_400_000;
/** The mean length of a month, to jump near a moment; each cycle is then checked exactly. */
const MONTH = 30.4375 * DAY;
/** The most cycles read after the jump, so a trigger that never starts again ends the search. */
const MAX_CYCLES = 400;

const minutesOf = { Minute: 1, Hour: 60, Day: 1440, Week: 10_080, Month: 0 } as const;

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;

/** `at` with `months` months added, in UTC; a day the month lacks becomes its last. */
function addMonths(at: number, months: number): number {
  const date = new Date(at);
  const month = date.getUTCMonth() + months;
  const year = date.getUTCFullYear();
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(date.getUTCDate(), last);
  return Date.UTC(year, month, day) + (at - Date.UTC(year, date.getUTCMonth(), date.getUTCDate()));
}

/** How a trigger's start moves by one cycle: in days or months of wall-clock time, or in minutes. */
type Step = { wall: boolean; months?: number; ms: number };

function stepOf(trigger: ResolvedTrigger): Step {
  const { frequency, interval } = trigger.every;
  const wall = trigger.type === "schedule" && frequency !== "Minute" && frequency !== "Hour";
  if (frequency === "Month") {
    // Four years of whole cycles: the start falls on the same date, even 29 February.
    const months = lcm(interval, 12) * 4;
    return { wall, months, ms: months * MONTH };
  }
  const length = interval * minutesOf[frequency];
  if (wall) return { wall, ms: length * MINUTE };
  return { wall, ms: lcm(length, 1440) * MINUTE };
}

/** The trigger with its start moved on by `cycles` whole cycles; undefined when it cannot be read. */
function movedOn(trigger: ResolvedTrigger, cycles: number): ResolvedTrigger | undefined {
  const start = readStart(trigger.start, clockOf(trigger.timezone));
  if (!start) return undefined;
  if (cycles === 0) return trigger;
  const step = stepOf(trigger);
  const from = step.wall ? start.wall : start.instant;
  const to = step.months ? addMonths(from, cycles * step.months) : from + cycles * step.ms;
  // A date the later year lacks (29 February in 2100) would change the days it runs on.
  if (step.months && new Date(to).getUTCDate() !== new Date(from).getUTCDate()) return undefined;
  const written = new Date(to).toISOString();
  return { ...trigger, start: step.wall ? written.slice(0, 19) : written };
}

/** The instant after which `trigger` no longer starts; infinite without an end, undefined if unreadable. */
function endOf(trigger: ResolvedTrigger): number | undefined {
  if (trigger.end === undefined) return Infinity;
  return readStart(trigger.end, clockOf(trigger.timezone))?.instant;
}

/** The starts of the `cycle`-th cycle from the trigger's start; none when it cannot be moved on. */
function cycleAt(trigger: ResolvedTrigger, cycle: number): Date[] {
  const moved = movedOn(trigger, cycle);
  return (moved && cycleStarts(moved)) ?? [];
}

type Window = { end: number; jump: number };

/**
 * The end, and the first cycle to read for `now`: every start of a cycle comes `lead` (a
 * window's delay, or a schedule's wait for its first day) after its start, so that is left out of
 * the time to cover. Undefined when the starts cannot be computed.
 */
function windowFor(trigger: ResolvedTrigger, now: Date): Window | undefined {
  const end = endOf(trigger);
  const first = cycleStarts(trigger)?.[0];
  const start = first && readStart(trigger.start, clockOf(trigger.timezone));
  if (!first || !start || end === undefined || end <= now.getTime()) return undefined;
  const lead = Math.max(0, first.getTime() - start.instant);
  const cycles = Math.floor((now.getTime() - start.instant - lead) / stepOf(trigger).ms) - 1;
  return { end, jump: Math.max(0, cycles) };
}

/** The first `count` starts after `now` from whole cycles read from the cycle `jump`. */
function fromCycles(trigger: ResolvedTrigger, now: Date, count: number, at: Window): Date[] {
  const found: Date[] = [];
  for (let cycle = at.jump; cycle < at.jump + MAX_CYCLES && found.length < count; cycle++) {
    const starts = cycleAt(trigger, cycle);
    // Later cycles start later still: once one starts at the end, nothing more can.
    if ((starts[0]?.getTime() ?? Infinity) >= at.end) break;
    const coming = starts.filter((start) => start > now && start.getTime() < at.end);
    found.push(...coming.slice(0, count - found.length));
  }
  return found;
}

/** The delay of a monthly tumbling window: its first end less the start and one interval. */
function delayOf(trigger: ResolvedTrigger, start: number): number {
  const first = cycleStarts(trigger)?.[0]?.getTime() ?? Number.NaN;
  return Math.max(0, first - addMonths(start, trigger.every.interval));
}

/**
 * A monthly tumbling window's ends: the start with the next whole number of months added, each
 * from the start itself, so a window started on 31 January ends 28 or 29 February, 31 March and
 * 30 April; each end is then moved by the delay, as the cycle's first start shows. Nothing when
 * the months run past the dates a clock can hold.
 */
function monthlyWindows(trigger: ResolvedTrigger, now: Date, count: number, end: number): Date[] {
  const start = readStart(trigger.start, clockOf(trigger.timezone))?.instant ?? Number.NaN;
  const { interval } = trigger.every;
  const delay = delayOf(trigger, start);
  const behind = new Date(now.getTime() - start - delay);
  const months = (behind.getUTCFullYear() - 1970) * 12 + behind.getUTCMonth();
  const first = Math.max(0, Math.floor(months / interval) - 1);
  const found: Date[] = [];
  for (let index = first; index < first + MAX_CYCLES && found.length < count; index++) {
    const at = addMonths(start, (index + 1) * interval) + delay;
    if (!Number.isFinite(at) || at >= end) break;
    if (at > now.getTime()) found.push(new Date(at));
  }
  return found;
}

/**
 * The first `count` starts of `trigger` after `now`, none after its end; undefined when its
 * starts cannot be computed or it starts no more.
 */
export function nextStarts(trigger: ResolvedTrigger, now: Date, count: number): Date[] | undefined {
  const window = windowFor(trigger, now);
  if (!window) return undefined;
  const monthly = trigger.type === "tumbling-window" && trigger.every.frequency === "Month";
  const found = monthly
    ? monthlyWindows(trigger, now, count, window.end)
    : fromCycles(trigger, now, count, window);
  return found.length > 0 ? found : undefined;
}
