// The hours in which the standard lets a trigger start a run (specification section 11.6).
import { isZone } from "../zones/index.js";
import { cycleOf, type Cycle } from "./recurrence.js";
import type { ResolvedTrigger } from "./types.js";
import { wallStarts } from "./wall-clock.js";
import { clockOf, DAY, mod, offsetPeriods, type Period } from "./zone.js";

/** The hours a trigger may start in: `from` to `to` (excluded), `HH:mm` in `timezone`. */
export interface Hours {
  from: string;
  to: string;
  timezone: string;
}

/** The days over which the offsets of the hours' zone are found. */
const YEAR = 366;

/** Whether a time of day, in ms after midnight, is in the hours; they may wrap midnight. */
function allowedBy({ from, to }: Hours): (time: number) => boolean {
  const read = (text: string) => {
    const [hours, minutes] = text.split(":").map(Number);
    return ((hours ?? 0) * 60 + (minutes ?? 0)) * 60_000;
  };
  const [low, high] = [read(from), read(to)];
  return low < high ? (time) => time >= low && time < high : (time) => time >= low || time < high;
}

/**
 * A start of the cycle like `start` in the first period of an offset: `start` itself when it is
 * in the period, else moved by whole cycles, or whole days, into it.
 */
function inPeriod(start: number, period: Period, cycle?: number): number {
  if (start >= period.at && start < period.until) return start;
  const moved = (size: number) => start + Math.ceil((period.at - start) / size) * size;
  const byCycle = cycle === undefined ? undefined : moved(cycle);
  return byCycle !== undefined && byCycle < period.until ? byCycle : moved(DAY);
}

/** The first start fixed in UTC outside the hours under an offset the zone uses in the year. */
function fixedOutside(cycle: Cycle, zone: string, allowed: (time: number) => boolean) {
  for (const period of offsetPeriods(zone, cycle.start, YEAR))
    for (const start of cycle.starts)
      if (!allowed(mod(start + period.offset, DAY))) return inPeriod(start, period, cycle.period);
  return undefined;
}

/** The first wall-clock start outside the hours, over the year and at least one cycle. */
function wallOutside(
  trigger: ResolvedTrigger,
  wall: { start: number; until: number },
  zone: string,
  allowed: (time: number) => boolean,
) {
  const [own, theirs] = [clockOf(trigger.timezone), clockOf(zone)];
  const until = Math.max(wall.until, wall.start + YEAR * DAY);
  for (const start of wallStarts(trigger, wall.start, until)) {
    const at = own.instant(start);
    if (!allowed(mod(at + theirs.offset(at), DAY))) return at;
  }
  return undefined;
}

/**
 * The first start whose local time in `hours.timezone` is outside [from, to), checking each UTC
 * offset the zone uses in the year after `trigger.start`. Undefined when every start is inside,
 * or the cycle cannot be bounded or read.
 * @example outsideHours(trigger, { from: "22:00", to: "06:00", timezone: "Europe/London" })
 * @public
 */
export function outsideHours(
  trigger: ResolvedTrigger,
  hours: { from: string; to: string; timezone: string },
): Date | undefined {
  const cycle = cycleOf(trigger);
  if (!cycle || !isZone(hours.timezone)) return undefined;
  const allowed = allowedBy(hours);
  const found = cycle.wall
    ? wallOutside(trigger, cycle.wall, hours.timezone, allowed)
    : fixedOutside(cycle, hours.timezone, allowed);
  return found === undefined ? undefined : new Date(found);
}
