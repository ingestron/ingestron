// Time in a zone for the run starts of triggers (specification section 11.6): a zone's offset
// from UTC at an instant, the instant of a wall-clock time, and the offsets a zone uses.

/** A day in milliseconds. */
export const DAY = 86_400_000;

const formats = new Map<string, Intl.DateTimeFormat>();

/** The formatter that gives the date and time in `zone`, made once for each zone. */
function formatIn(zone: string): Intl.DateTimeFormat {
  let format = formats.get(zone);
  if (!format) {
    const fields = { year: "numeric", month: "numeric", day: "numeric" } as const;
    const time = { hour: "numeric", minute: "numeric", second: "numeric" } as const;
    format = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hourCycle: "h23",
      ...fields,
      ...time,
    });
    formats.set(zone, format);
  }
  return format;
}

/** `value` modulo `size`, never negative. */
export function mod(value: number, size: number): number {
  return ((value % size) + size) % size;
}

/** The offset of `zone` from UTC at the instant `at` (milliseconds since the epoch), in ms. */
export function offsetAt(zone: string, at: number): number {
  const parts = formatIn(zone).formatToParts(new Date(at));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((found) => found.type === type)?.value);
  const wall = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"));
  return wall + part("second") * 1000 - (at - mod(at, 1000));
}

/**
 * A zone's clock: its offset at an instant, and the instant of a wall-clock time.
 * @example clockOf("Europe/London").offset(Date.UTC(2026, 6, 1)) // 3600000
 * @public
 */
export interface Clock {
  /** The offset from UTC at the instant `at`, in ms. */
  offset(at: number): number;
  /**
   * The instant of the wall-clock time `wall` (its date and time read as UTC). A time the zone
   * skips is read with the offset before the change, so it falls after it; a time the zone has
   * twice is the first.
   */
  instant(wall: number): number;
}

/**
 * The clock of `zone`, an IANA zone name, which reads the zone's offsets once for each day.
 * @example clockOf("Europe/London").instant(Date.UTC(2026, 9, 25, 1, 30)) // the first 01:30, in summer time
 * @public
 */
export function clockOf(zone: string): Clock {
  const days = new Map<number, number>();
  const atDay = (day: number) => {
    if (!days.has(day)) days.set(day, offsetAt(zone, day * DAY));
    return days.get(day) as number;
  };
  const offset = (at: number) => {
    const day = Math.floor(at / DAY);
    const first = atDay(day);
    return first === atDay(day + 1) ? first : offsetAt(zone, at);
  };
  const instant = (wall: number) => {
    const before = offset(wall - DAY);
    const after = offset(wall + DAY);
    if (before === after) return wall - before;
    const valid = [before, after].filter((candidate) => offset(wall - candidate) === candidate);
    return valid.length === 0 ? wall - before : wall - Math.max(...valid);
  };
  return { offset, instant };
}

/** A span of time over which a zone keeps one offset. */
export interface Period {
  at: number;
  until: number;
  offset: number;
}

/** The instant in (`low`, `high`] at which the offset of `zone` changes. */
function change(zone: string, low: number, high: number): number {
  const before = offsetAt(zone, low);
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (offsetAt(zone, middle) === before) low = middle;
    else high = middle;
  }
  return high;
}

/**
 * The first period of each offset `zone` uses in the `days` days from `from`, in the order they
 * first apply.
 */
export function offsetPeriods(zone: string, from: number, days: number): Period[] {
  const end = from + days * DAY;
  const periods: Period[] = [{ at: from, until: end, offset: offsetAt(zone, from) }];
  for (let day = 1; day <= days; day++) {
    const current = periods[periods.length - 1] as Period;
    const offset = offsetAt(zone, from + day * DAY);
    if (offset === current.offset) continue;
    current.until = change(zone, from + (day - 1) * DAY, from + day * DAY);
    periods.push({ at: current.until, until: end, offset });
  }
  return periods.filter(
    (period, index) => periods.findIndex((other) => other.offset === period.offset) === index,
  );
}

/**
 * The time `at` in `zone`, written `HH:mm`, as the allowed-hours problem gives it.
 * @example clockTime(new Date("2026-07-01T05:00:00Z"), "Europe/London") // "06:00"
 * @public
 */
export function clockTime(at: Date, zone: string): string {
  const options = { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" } as const;
  return new Intl.DateTimeFormat("en-GB", options).format(at);
}

/** `at` with `months` calendar months added, in UTC; a day the month lacks becomes its last. */
export function addMonths(at: number, months: number): number {
  const date = new Date(at);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(year, month, Math.min(date.getUTCDate(), last)) + mod(at, DAY);
}
