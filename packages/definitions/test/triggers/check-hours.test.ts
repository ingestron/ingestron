// The hours in which a standard lets a trigger start a run (specification section 11.6).
import { describe, expect, it } from "vitest";
import { outsideHours } from "../../src/index.js";
import { problems, resolve } from "./project.js";
import { trigger } from "./trigger.js";

const night = { from: "22:00", to: "06:00", timezone: "Europe/London" };
const london = (date: Date | undefined) =>
  date?.toLocaleTimeString("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
  });

describe("outsideHours", () => {
  it("finds the first start outside the hours, in the zone of the hours", () => {
    const found = outsideHours(trigger(), night);
    expect(london(found)).toBe("06:00");
    expect(found?.toISOString()).toBe("2026-12-01T06:00:00.000Z");
  });

  it("finds none for a daily start inside the hours, in the same zone all year", () => {
    const at = { hours: [1], minutes: [30] };
    const daily = trigger({
      every: { frequency: "Day", interval: 1 },
      at,
      timezone: "Europe/London",
    });
    expect(outsideHours(daily, night)).toBeUndefined();
  });

  it("checks a start fixed in UTC under each offset the zone of the hours uses", () => {
    const hourly = trigger({ every: { frequency: "Hour", interval: 24 } });
    const early = { from: "00:00", to: "01:00", timezone: "Europe/London" };
    const found = outsideHours({ ...hourly, start: "2026-12-01T00:30:00Z" }, early);
    expect(found?.toISOString()).toBe("2027-03-29T00:30:00.000Z");
    expect(london(found)).toBe("01:30");
  });

  it("checks a wall-clock start in another zone on each date of the year", () => {
    const at = { hours: [17], minutes: [0] };
    const every = { frequency: "Day", interval: 1 } as const;
    const daily = trigger({ every, at, timezone: "America/New_York" });
    const late = { from: "22:00", to: "06:00", timezone: "Europe/London" };
    expect(outsideHours(daily, late)?.toISOString()).toBe("2027-03-14T21:00:00.000Z");
  });

  it("treats `to` as exclusive and a window not wrapping midnight as one span", () => {
    const daily = trigger({ every: { frequency: "Day", interval: 1 }, at: { hours: [9] } });
    const day = { from: "08:00", to: "09:00", timezone: "UTC" };
    expect(outsideHours(daily, day)?.toISOString()).toBe("2026-12-01T09:00:00.000Z");
    expect(outsideHours(daily, { ...day, to: "09:01" })).toBeUndefined();
  });
});

describe("TRIGGER_HOURS", () => {
  const ingest = (every: string) =>
    `  triggers:\n    - { name: hourly, type: schedule, every: ${every}, start: "2026-12-01T00:00:00Z" }`;
  const operations =
    '  schedule: { per: flow }\n  triggers: { hours: { from: "22:00", to: "06:00" } }\n';

  it("is an error at the trigger for a start outside the hours, once for the flow", () => {
    const result = resolve(ingest("{ frequency: Hour, interval: 1 }"), operations, 2);
    expect(problems(result)).toEqual([
      'TRIGGER_HOURS: "hourly" starts a run at 06:00 (UTC), outside the hours the standard allows here: 22:00–06:00.',
    ]);
    expect(result.diagnostics[0]?.location?.line).toBe(7);
  });

  it("says when the start times cannot be checked", () => {
    const all = (to: number) => `[${[...Array(to).keys()].join(", ")}]`;
    const at = `{ month_days: [1, 2, 3, 4, 5], hours: ${all(24)}, minutes: ${all(60)} }`;
    const text = ingest(`{ frequency: Month, interval: 1 }, at: ${at}`);
    expect(problems(resolve(text, operations))).toEqual([
      "TRIGGER_HOURS: Ingestron cannot check this schedule's start times; write a shorter cycle.",
    ]);
  });

  it("is not reported without hours", () => {
    expect(problems(resolve(ingest("{ frequency: Hour, interval: 1 }")))).toEqual([]);
  });
});
