// The next starts of a trigger after a moment, found by moving its start on by whole cycles.
import type { ResolvedTrigger } from "@ingestron/definitions";
import { describe, expect, it } from "vitest";
import { nextStarts } from "../../src/hover/trigger-starts.js";

const trigger = (rest: Partial<ResolvedTrigger>): ResolvedTrigger =>
  ({ flow: "shop", name: "t", type: "schedule", timezone: "UTC", ...rest }) as ResolvedTrigger;
const every = (frequency: "Minute" | "Hour" | "Day" | "Month", interval: number) => ({
  frequency,
  interval,
});
const after = (rest: Partial<ResolvedTrigger>, now = "2026-12-01T00:30:00Z") =>
  nextStarts(trigger(rest), new Date(now), 3)?.map((start) => start.toISOString());

describe("next starts", () => {
  it("moves a trigger started years ago on to now", () => {
    expect(after({ every: every("Hour", 1), start: "2020-01-01T00:00:00Z" })).toEqual([
      "2026-12-01T01:00:00.000Z",
      "2026-12-01T02:00:00.000Z",
      "2026-12-01T03:00:00.000Z",
    ]);
  });

  it("keeps the days of a recurrence every third day", () => {
    expect(after({ every: every("Day", 3), start: "2026-01-01T06:00:00" })).toEqual([
      "2026-12-03T06:00:00.000Z",
      "2026-12-06T06:00:00.000Z",
      "2026-12-09T06:00:00.000Z",
    ]);
  });

  it("skips the months that lack the day of a monthly schedule", () => {
    expect(after({ every: every("Month", 1), start: "2024-01-31T09:00:00" })).toEqual([
      "2026-12-31T09:00:00.000Z",
      "2027-01-31T09:00:00.000Z",
      "2027-03-31T09:00:00.000Z",
    ]);
  });

  it("ends each window of a monthly tumbling trigger on its month", () => {
    const monthly = { type: "tumbling-window", every: every("Month", 1) } as const;
    expect(after({ ...monthly, start: "2025-01-15T00:00:00Z" })).toEqual([
      "2026-12-15T00:00:00.000Z",
      "2027-01-15T00:00:00.000Z",
      "2027-02-15T00:00:00.000Z",
    ]);
  });

  it("clamps each end of a window started on 31 January from the start itself", () => {
    const monthly = { type: "tumbling-window", every: every("Month", 1), delay: "5m" } as const;
    expect(after({ ...monthly, start: "2026-01-31T00:00:00Z" }, "2026-02-01T00:00:00Z")).toEqual([
      "2026-02-28T00:05:00.000Z",
      "2026-03-31T00:05:00.000Z",
      "2026-04-30T00:05:00.000Z",
    ]);
    expect(after({ ...monthly, start: "2024-01-31T00:00:00Z" }, "2028-02-01T00:00:00Z")).toEqual([
      "2028-02-29T00:05:00.000Z",
      "2028-03-31T00:05:00.000Z",
      "2028-04-30T00:05:00.000Z",
    ]);
  });

  it("keeps the last day of each month for a schedule on month_days -1", () => {
    const last = {
      every: every("Month", 1),
      start: "2020-01-31T09:00:00",
      at: { month_days: [-1] },
    };
    expect(after(last)).toEqual([
      "2026-12-31T09:00:00.000Z",
      "2027-01-31T09:00:00.000Z",
      "2027-02-28T09:00:00.000Z",
    ]);
  });

  it("gives the starts before the end only, and none after it", () => {
    const daily = { every: every("Day", 1), start: "2026-01-01T06:00:00" };
    expect(after({ ...daily, end: "2026-12-02T12:00:00Z" })).toHaveLength(2);
    expect(after({ ...daily, end: "2026-11-01T00:00:00Z" })).toBeUndefined();
  });

  it("counts a delay of days before moving on to now", () => {
    const window = { type: "tumbling-window", delay: "3d", start: "2026-11-21T00:00:00Z" } as const;
    const now = "2026-12-01T00:30:00Z";
    expect(after({ ...window, every: every("Minute", 1) }, now)).toEqual([
      "2026-12-01T00:31:00.000Z",
      "2026-12-01T00:32:00.000Z",
      "2026-12-01T00:33:00.000Z",
    ]);
    expect(after({ ...window, every: every("Hour", 1) }, now)?.[0]).toBe(
      "2026-12-01T01:00:00.000Z",
    );
  });

  it("counts a delay of months before moving on to now", () => {
    const window = { type: "tumbling-window", every: every("Month", 1), delay: "100d" } as const;
    expect(after({ ...window, start: "2026-01-01T00:00:00Z" }, "2026-12-01T00:00:00Z")?.[0]).toBe(
      "2026-12-10T00:00:00.000Z",
    );
  });

  it("gives nothing, quickly, for a monthly window too long to date", () => {
    const began = Date.now();
    const window = { type: "tumbling-window", every: every("Month", 4_000_000) } as const;
    expect(after({ ...window, start: "2026-01-01T00:00:00Z" })).toBeUndefined();
    expect(Date.now() - began).toBeLessThan(500);
  });

  it("gives nothing, quickly, when the end comes before the next start", () => {
    const began = Date.now();
    const minutes = { every: every("Hour", 1), start: "2026-01-01T00:00:00Z" };
    expect(after({ ...minutes, end: "2026-12-01T00:45:00Z" })).toBeUndefined();
    expect(Date.now() - began).toBeLessThan(500);
  });

  it("gives nothing for a start or zone it cannot read", () => {
    expect(after({ every: every("Day", 1), start: "soon" })).toBeUndefined();
    expect(
      after({ every: every("Day", 1), start: "2026-01-01", timezone: "Mars/Base" }),
    ).toBeUndefined();
  });
});
