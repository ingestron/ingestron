// How a trigger's start is read (specification section 11.6): an instant with `Z` or an offset,
// else a wall-clock time in the zone, where a skipped time falls after the change and a
// repeated time is the first of the two.
import { describe, expect, it } from "vitest";
import { clockOf, clockTime, readStart } from "../../src/index.js";

const instant = (start: string, zone: string) => {
  const read = readStart(start, clockOf(zone));
  return read && new Date(read.instant).toISOString();
};

describe("readStart", () => {
  it("reads an offset written with a colon, without one, or as hours alone", () => {
    for (const start of [
      "2026-12-01T00:00:00+01:00",
      "2026-12-01T00:00:00+0100",
      "2026-12-01T00:00:00+01",
    ])
      expect(instant(start, "UTC")).toBe("2026-11-30T23:00:00.000Z");
    expect(instant("2026-12-01T00:00:00Z", "Europe/Berlin")).toBe("2026-12-01T00:00:00.000Z");
  });

  it("reads a time the clocks skip as falling after the change, east and west of UTC", () => {
    expect(instant("2026-03-29T02:30:00", "Europe/Berlin")).toBe("2026-03-29T01:30:00.000Z");
    expect(instant("2026-03-08T02:30:00", "America/New_York")).toBe("2026-03-08T07:30:00.000Z");
  });

  it("reads a time the clocks repeat as the first of the two, east and west of UTC", () => {
    expect(instant("2026-10-25T01:30:00", "Europe/London")).toBe("2026-10-25T00:30:00.000Z");
    expect(instant("2026-10-25T02:30:00", "Europe/Berlin")).toBe("2026-10-25T00:30:00.000Z");
    expect(instant("2026-11-01T01:30:00", "America/New_York")).toBe("2026-11-01T05:30:00.000Z");
  });

  it("keeps the wall-clock time as written, and reads a date alone as its midnight", () => {
    const read = readStart("2026-07-05T02:00:00", clockOf("Europe/London"));
    expect(read && new Date(read.wall).toISOString()).toBe("2026-07-05T02:00:00.000Z");
    expect(instant("2026-07-05", "Europe/London")).toBe("2026-07-04T23:00:00.000Z");
    expect(readStart("soon", clockOf("UTC"))).toBeUndefined();
  });

  it("cannot read a date or time that is not on the calendar or the clock", () => {
    for (const start of [
      "2026-02-30T00:00:00Z",
      "2026-13-01T00:00:00",
      "2026-12-01T24:00:00Z",
      "2026-12-01T02:60",
      "2026-12-01 02:30",
    ])
      expect(readStart(start, clockOf("UTC")), start).toBeUndefined();
    expect(instant("2028-02-29T23:59:59Z", "UTC")).toBe("2028-02-29T23:59:59.000Z");
  });
});

describe("clockTime", () => {
  it("writes the time in the zone as HH:mm", () => {
    expect(clockTime(new Date("2026-07-01T05:00:00Z"), "Europe/London")).toBe("06:00");
  });
});
