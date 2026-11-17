// The run starts of a wall-clock schedule where the zone's clocks change, and on days of the
// month that a month lacks (specification section 11.6).
import { describe, expect, it } from "vitest";
import { cycleStarts, type ScheduleAt } from "../../src/index.js";
import { trigger } from "./trigger.js";

const iso = (starts: Date[] | undefined) => starts?.map((date) => date.toISOString());

/** The starts over a week of a schedule on Saturday and Sunday at a time, in a zone. */
function weekend(start: string, timezone: string, hours: number, minutes: number) {
  const at: ScheduleAt = { weekdays: ["Saturday", "Sunday"], hours: [hours], minutes: [minutes] };
  return iso(
    cycleStarts(trigger({ every: { frequency: "Week", interval: 1 }, at, start, timezone })),
  );
}

describe("a local time the clocks skip", () => {
  it("starts that much later, east of UTC", () => {
    // Berlin goes from 02:00 to 03:00 on 29 March 2026: 02:30 starts at 03:30, 01:30 UTC.
    expect(weekend("2026-03-28T00:00:00", "Europe/Berlin", 2, 30)).toEqual([
      "2026-03-28T01:30:00.000Z",
      "2026-03-29T01:30:00.000Z",
    ]);
  });

  it("starts that much later, west of UTC", () => {
    // New York goes from 02:00 to 03:00 on 8 March 2026: 02:30 starts at 03:30, 07:30 UTC.
    expect(weekend("2026-03-07T00:00:00", "America/New_York", 2, 30)).toEqual([
      "2026-03-07T07:30:00.000Z",
      "2026-03-08T07:30:00.000Z",
    ]);
  });
});

describe("a local time the clocks repeat", () => {
  it("starts at the first of the two, east and west of UTC", () => {
    // London has 01:30 twice on 25 October 2026; the first is still summer time, 00:30 UTC.
    expect(weekend("2026-10-24T00:00:00", "Europe/London", 1, 30)).toEqual([
      "2026-10-24T00:30:00.000Z",
      "2026-10-25T00:30:00.000Z",
    ]);
    // New York has 01:30 twice on 1 November 2026; the first is still daylight time, 05:30 UTC.
    expect(weekend("2026-10-31T00:00:00", "America/New_York", 1, 30)).toEqual([
      "2026-10-31T05:30:00.000Z",
      "2026-11-01T05:30:00.000Z",
    ]);
  });
});

describe("a day of the month the month lacks", () => {
  const monthly = (day: number) =>
    iso(
      cycleStarts(
        trigger({
          every: { frequency: "Month", interval: 1 },
          start: "2027-01-01T00:00:00Z",
          at: { month_days: [day], hours: [0], minutes: [0] },
        }),
      ),
    ) ?? [];

  it("skips day 31 in the months of 30 days and in February", () => {
    const starts = monthly(31);
    expect(starts).toHaveLength(28);
    expect(starts.slice(0, 4)).toEqual([
      "2027-01-31T00:00:00.000Z",
      "2027-03-31T00:00:00.000Z",
      "2027-05-31T00:00:00.000Z",
      "2027-07-31T00:00:00.000Z",
    ]);
  });

  it("skips day -31 in the same months, counting from their end", () => {
    const starts = monthly(-31);
    expect(starts).toHaveLength(28);
    expect(starts.slice(0, 4)).toEqual([
      "2027-01-01T00:00:00.000Z",
      "2027-03-01T00:00:00.000Z",
      "2027-05-01T00:00:00.000Z",
      "2027-07-01T00:00:00.000Z",
    ]);
    expect(starts.some((start) => start.slice(5, 7) === "02")).toBe(false);
  });
});
