// The run start times of a trigger over one cycle (specification section 11.6).
import { describe, expect, it } from "vitest";
import { cycleStarts, longestGap } from "../../src/index.js";
import { trigger } from "./trigger.js";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const iso = (starts: Date[] | undefined) => starts?.map((date) => date.toISOString());

describe("a schedule by the minute or hour", () => {
  it("starts every interval from the start, over the day", () => {
    const starts = iso(cycleStarts(trigger()));
    expect(starts).toHaveLength(24);
    expect(starts?.[0]).toBe("2026-12-01T00:00:00.000Z");
    expect(starts?.[23]).toBe("2026-12-01T23:00:00.000Z");
  });

  it("covers the least common multiple of the interval and the day", () => {
    const every = { frequency: "Minute", interval: 7 } as const;
    expect(cycleStarts(trigger({ every }))).toHaveLength(1440);
    expect(cycleStarts(trigger({ every: { frequency: "Hour", interval: 5 } }))).toHaveLength(24);
  });

  it("is not moved by daylight saving", () => {
    const starts = iso(
      cycleStarts(trigger({ timezone: "Europe/London", start: "2027-03-28T00:00:00Z" })),
    );
    expect(starts?.[2]).toBe("2027-03-28T02:00:00.000Z");
  });
});

describe("a schedule by the day, week or month", () => {
  it("starts on the weekdays at the times given, in the trigger's zone", () => {
    const at = { weekdays: ["Sunday" as const], hours: [2], minutes: [0] };
    const every = { frequency: "Week", interval: 1 } as const;
    const weekly = trigger({ every, at, timezone: "Europe/London" });
    expect(iso(cycleStarts(weekly))).toEqual(["2026-12-06T02:00:00.000Z"]);
    expect(iso(cycleStarts({ ...weekly, start: "2027-06-01T00:00:00Z" }))).toEqual([
      "2027-06-06T01:00:00.000Z",
    ]);
  });

  it("takes the time of the start when no times are given", () => {
    const daily = trigger({
      every: { frequency: "Day", interval: 2 },
      start: "2026-12-01T05:30:00",
    });
    expect(iso(cycleStarts({ ...daily, timezone: "Europe/Paris" }))).toEqual([
      "2026-12-01T04:30:00.000Z",
    ]);
  });

  it("starts on days of the month, counting a negative day from the end", () => {
    const at = { month_days: [1, -1], hours: [0], minutes: [0] };
    const monthly = trigger({ every: { frequency: "Month", interval: 1 }, at });
    const starts = iso(cycleStarts(monthly)) ?? [];
    expect(starts).toHaveLength(96);
    expect(starts.slice(0, 3)).toEqual([
      "2026-12-01T00:00:00.000Z",
      "2026-12-31T00:00:00.000Z",
      "2027-01-01T00:00:00.000Z",
    ]);
    expect(starts).toContain("2028-02-29T00:00:00.000Z");
  });

  it("starts on weekday occurrences of the month", () => {
    const at = { occurrences: [{ day: "Monday" as const, occurrence: 1 }], hours: [6] };
    const monthly = trigger({ every: { frequency: "Month", interval: 6 }, at });
    expect(iso(cycleStarts(monthly))?.slice(0, 2)).toEqual([
      "2026-12-07T06:00:00.000Z",
      "2027-06-07T06:00:00.000Z",
    ]);
  });

  it("cannot bound a cycle of more than 200,000 starts", () => {
    const minutes = Array.from({ length: 60 }, (_, minute) => minute);
    const hours = Array.from({ length: 24 }, (_, hour) => hour);
    const at = { month_days: [1, 2, 3, 4, 5], hours, minutes };
    expect(
      cycleStarts(trigger({ every: { frequency: "Month", interval: 1 }, at })),
    ).toBeUndefined();
  });
});

describe("a tumbling window", () => {
  it("starts each window's run when the window ends, after the delay", () => {
    const window = trigger({ type: "tumbling-window", delay: "5m" });
    const starts = cycleStarts(window) ?? [];
    expect(starts).toHaveLength(24);
    expect(starts[0]?.getTime()).toBe(Date.parse("2026-12-01T00:00:00Z") + HOUR + 5 * 60_000);
  });

  it("adds calendar months, over twelve windows", () => {
    const every = { frequency: "Month", interval: 1 } as const;
    const starts = iso(cycleStarts(trigger({ type: "tumbling-window", every })));
    expect(starts).toHaveLength(12);
    expect(starts?.slice(0, 2)).toEqual(["2027-01-01T00:00:00.000Z", "2027-02-01T00:00:00.000Z"]);
  });
});

describe("the longest gap", () => {
  it("measures between starts and into the next cycle", () => {
    const at = { hours: [6, 18], minutes: [0] };
    expect(longestGap(trigger({ every: { frequency: "Day", interval: 1 }, at }))).toBe(12 * HOUR);
    const uneven = { hours: [6, 9], minutes: [0] };
    expect(longestGap(trigger({ every: { frequency: "Day", interval: 1 }, at: uneven }))).toBe(
      21 * HOUR,
    );
  });

  it("takes the next start from the recurrence, for weekday occurrences of the month", () => {
    const at = { occurrences: [{ day: "Monday" as const, occurrence: 1 }], hours: [6] };
    const monthly = trigger({ every: { frequency: "Month", interval: 6 }, at });
    expect(longestGap(monthly)).toBe(182 * DAY);
  });

  it("measures a wall-clock schedule's real gaps across a change of clocks", () => {
    const at = { hours: [2], minutes: [0] };
    const every = { frequency: "Day", interval: 1 } as const;
    const daily = trigger({ every, at, timezone: "Europe/London", start: "2027-10-01T00:00:00Z" });
    expect(longestGap(daily)).toBe(25 * HOUR);
  });

  it("is undefined when the cycle cannot be bounded", () => {
    const at = {
      month_days: [1, 2, 3, 4, 5],
      hours: [...Array(24).keys()],
      minutes: [...Array(60).keys()],
    };
    expect(longestGap(trigger({ every: { frequency: "Month", interval: 1 }, at }))).toBeUndefined();
  });
});
