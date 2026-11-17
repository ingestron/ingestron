// The wall-clock run starts of a schedule by the day, week or month (specification section
// 11.6): the days it runs on and its times of day in the trigger's zone, before they become
// instants. A wall-clock time is held as its date and time read as UTC.
import { DAY, mod } from "./zone.js";
import type { ResolvedTrigger, ScheduleAt, Weekday } from "./types.js";

const HOUR = 3_600_000;
const MINUTE = 60_000;

const weekdays: Weekday[] = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** The numbers in ascending order, each once. */
const sorted = (numbers: number[]) => [...new Set(numbers)].sort((a, b) => a - b);

/** The weekday of the date `day` (days since 1 January 1970, a Thursday), Sunday being 0. */
const weekdayOf = (day: number) => mod(day + 4, 7);

/** The times of day a schedule starts at, in ms after midnight: from `at`, else the start's. */
function timesOfDay(at: ScheduleAt | undefined, startWall: number): number[] {
  const time = mod(startWall, DAY);
  if (at?.hours === undefined && at?.minutes === undefined) return [time];
  const hours = at?.hours ?? [Math.floor(time / HOUR)];
  const minutes = at?.minutes ?? [Math.floor(time / MINUTE) % 60];
  return sorted(hours.flatMap((hour) => minutes.map((minute) => hour * HOUR + minute * MINUTE)));
}

/** Every `interval`-th day from `first`, before `until`. */
function* everyDay(first: number, interval: number, until: number): Generator<number> {
  for (let day = first; day < until; day += interval) yield day;
}

/** The weekdays of `at` (else that of `first`) in every `interval`-th week from `first`. */
function* everyWeek(first: number, interval: number, until: number, at?: ScheduleAt) {
  const wanted = new Set(at?.weekdays?.map((day) => weekdays.indexOf(day)) ?? [weekdayOf(first)]);
  for (let week = first; week < until; week += 7 * interval)
    for (let day = week; day < Math.min(week + 7, until); day++)
      if (wanted.has(weekdayOf(day))) yield day;
}

/** The days of the month an occurrence names: the n-th such weekday, or all of them. */
function occurrenceDays(
  first: number,
  length: number,
  { day, occurrence }: { day: Weekday; occurrence?: number },
): number[] {
  const all: number[] = [];
  for (let date = 1 + mod(weekdays.indexOf(day) - weekdayOf(first), 7); date <= length; date += 7)
    all.push(date);
  if (occurrence === undefined) return all;
  const picked = all[occurrence > 0 ? occurrence - 1 : all.length + occurrence];
  return picked === undefined ? [] : [picked];
}

/** The days a schedule by the month runs on in the month whose first day is `first`. */
function monthDays(first: number, at: ScheduleAt | undefined, startDate: number): number[] {
  const date = new Date(first * DAY);
  const length = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  const dates = at?.month_days?.map((day) => (day < 0 ? length + 1 + day : day)) ??
    at?.occurrences?.flatMap((occurrence) => occurrenceDays(first, length, occurrence)) ?? [
      startDate,
    ];
  return sorted(dates.filter((day) => day >= 1 && day <= length)).map((day) => first + day - 1);
}

/** The days of every `interval`-th month from that of `first`, before `until`. */
function* everyMonth(first: number, interval: number, until: number, at?: ScheduleAt) {
  const start = new Date(first * DAY);
  const month = start.getUTCFullYear() * 12 + start.getUTCMonth();
  for (let index = month; ; index += interval) {
    const day = Date.UTC(Math.floor(index / 12), index % 12, 1) / DAY;
    if (day >= until) return;
    yield* monthDays(day, at, start.getUTCDate());
  }
}

/** The days the trigger runs on from the date `first`, in order, before `until`. */
function daysOf(trigger: ResolvedTrigger, first: number, until: number): Iterable<number> {
  const { frequency, interval } = trigger.every;
  if (frequency === "Week") return everyWeek(first, interval, until, trigger.at);
  if (frequency === "Month") return everyMonth(first, interval, until, trigger.at);
  return everyDay(first, interval, until);
}

/**
 * The wall-clock starts of a schedule by the day, week or month from `startWall` (the start,
 * included) to `untilWall` (excluded), in order.
 */
export function* wallStarts(
  trigger: ResolvedTrigger,
  startWall: number,
  untilWall: number,
): Generator<number> {
  const times = timesOfDay(trigger.at, startWall);
  for (const day of daysOf(trigger, Math.floor(startWall / DAY), untilWall / DAY))
    for (const time of times) {
      const wall = day * DAY + time;
      if (wall >= untilWall) return;
      if (wall >= startWall) yield wall;
    }
}
