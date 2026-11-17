// The problems a flow's triggers and parameters give (specification section 5.1).
import { describe, expect, it } from "vitest";
import { problems, problemsOf, resolve } from "./project.js";

const start = '"2026-12-01T00:00:00Z"';
const schedule = (extra: string) =>
  `{ name: daily, type: schedule, every: { frequency: Day, interval: 1 }, start: ${start}${extra} }`;
const window = (extra: string) =>
  `{ name: hourly, type: tumbling-window, every: { frequency: Hour, interval: 1 }, start: ${start}${extra} }`;
const declared =
  "    min_date: { type: date, default: '2020-01-01' }\n    n: { type: int, default: 1 }";

describe("parameters", () => {
  it.each([
    ["a date given a number", schedule(", parameters: { min_date: 5 }"), "min_date", "5"],
    ["a date given other text", schedule(", parameters: { min_date: soon }"), "min_date", '"soon"'],
    ["a whole number given a fraction", schedule(", parameters: { n: 1.5 }"), "n", "1.5"],
  ])("refuses %s", (_, trigger, name, value) => {
    const found = problemsOf(trigger, declared);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(`The parameter "${name}" is `);
    expect(found[0]).toContain(`gives ${value}.`);
  });

  it("accepts a literal of the type and an expression", () => {
    const parameters = ", parameters: { min_date: '2021-02-03', n: { expression: '@x' } }";
    expect(problemsOf(schedule(parameters), declared)).toEqual([]);
  });

  it("refuses a name the flow does not declare", () => {
    expect(problemsOf(schedule(", parameters: { region: eu }"))).toEqual([
      'TRIGGER_PARAMETER: The trigger "daily" sets the parameter "region", which the flow does not declare.',
    ]);
  });

  it.each([
    ["a name that is reserved", "    windowEnd: { type: string, default: x }", "is reserved"],
    ["a name that is not lowercase", "    Region: { type: string, default: x }", "not a valid"],
    ["a declaration without a default", "    region: { type: string }", "has no default"],
    ["a default of the wrong type", "    when: { type: date, default: 3 }", "default of the"],
  ])("refuses %s", (_, declaration, text) => {
    const found = problemsOf(schedule(""), declaration);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/^TRIGGER_PARAMETER: /);
    expect(found[0]).toContain(text);
  });

  it("lets a trigger set load to incremental, full or an expression", () => {
    for (const value of ["incremental", "full", "{ expression: '@x' }"])
      expect(
        problemsOf(schedule(`, parameters: { load: ${value} }`), "", 1, "\nhistory: latest"),
      ).toEqual([]);
  });

  it("refuses another value of load, and tables", () => {
    for (const name of ["load: weekly", "tables: x"])
      expect(problemsOf(schedule(`, parameters: { ${name} }`))).toHaveLength(1);
  });

  it("lets a schedule trigger set a window as an expression, not a literal", () => {
    const set = (value: string) => problemsOf(schedule(`, parameters: { windowStart: ${value} }`));
    expect(set("{ expression: '@x' }")).toEqual([]);
    expect(set("x")).toEqual([
      'TRIGGER_PARAMETER: The built-in parameter "windowStart" of the trigger "daily" must be an expression.',
    ]);
  });
});

describe("options", () => {
  it.each([
    [schedule(", delay: 5m"), "delay"],
    [schedule(", concurrency: 2"), "concurrency"],
    [window(", at: { hours: [2] }"), "at"],
    [window(", lookback: 2h"), "lookback"],
  ])("refuses an option of the other type: %#", (trigger, option) => {
    const found = problemsOf(trigger);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/^TRIGGER_OPTION: .* so it cannot have /);
    expect(found[0]).toContain(`cannot have ${option}.`);
  });

  it("refuses a name used twice", () => {
    expect(problemsOf(`${schedule("")}, ${schedule("")}`)).toEqual([
      'TRIGGER_OPTION: The trigger name "daily" is used twice in the flow "shop".',
    ]);
  });

  it("accepts a dependency on itself and on a tumbling window of the project", () => {
    const depends = (dependency: string) => problemsOf(window(`, depends_on: [${dependency}]`));
    expect(depends("{ self: true, offset: -1h }")).toEqual([]);
    expect(depends("{ trigger: hourly }")).toEqual([]);
    expect(depends("{ trigger: shop/hourly }")).toEqual([]);
  });

  it("refuses a dependency on no tumbling window of the project", () => {
    const depends = (dependency: string) =>
      problemsOf(`${schedule("")}, ${window(`, depends_on: [${dependency}]`)}`);
    for (const name of ["missing", "daily", "other/hourly"])
      expect(depends(`{ trigger: ${name} }`)).toEqual([
        `TRIGGER_OPTION: The trigger "hourly" depends on "${name}", which is not a tumbling-window trigger of the project.`,
      ]);
  });

  it("refuses a time zone that is not on the list", () => {
    expect(problemsOf(schedule(", timezone: Mars/Base"))).toEqual([
      'TIMEZONE_NAME: "Mars/Base" is not a time zone name.',
    ]);
  });

  it("reports a problem once, however many tables the flow has", () => {
    const found = problemsOf(schedule(", delay: 5m"), "", 2);
    expect(found).toHaveLength(1);
  });
});

describe("a trigger's start, end and limits", () => {
  const daily = (extra: string, at = start) =>
    `{ name: nightly, type: schedule, every: { frequency: Day, interval: 1 }, start: ${at}${extra} }`;

  it("refuses a start or end in another form in the schema, at the value", () => {
    for (const trigger of [daily("", '"2026-12-01 02:30"'), daily(', end: "1 December 2027"')])
      expect(problemsOf(trigger).map((text) => text.split(":")[0])).toEqual(["SCHEMA"]);
  });

  it("is TRIGGER_OPTION for a start or end Ingestron cannot read, before any hours check", () => {
    expect(problemsOf(daily(', end: "2027-02-30T00:00:00Z"', '"2026-13-01T02:30"'))).toEqual([
      'TRIGGER_OPTION: "nightly" has a start Ingestron cannot read: "2026-13-01T02:30". Write it as 2026-12-01T02:30:00, with Z or an offset for a fixed instant.',
      'TRIGGER_OPTION: "nightly" has an end Ingestron cannot read: "2027-02-30T00:00:00Z". Write it as 2026-12-01T02:30:00, with Z or an offset for a fixed instant.',
    ]);
  });

  it("keeps the schema's limits on the interval and concurrency, so an editor finds them", () => {
    const every = schedule("").replace("interval: 1", "interval: 1001");
    expect(problemsOf(every).map((text) => text.split(":")[0])).toEqual(["SCHEMA"]);
    expect(problemsOf(window(", concurrency: 51"))[0]).toMatch(/^SCHEMA: /);
  });

  it("refuses month_days with occurrences, at `at`", () => {
    const monthly = `{ name: monthly, type: schedule, every: { frequency: Month, interval: 1 }, start: ${start}, at: { month_days: [1], occurrences: [{ day: Monday }] } }`;
    expect(problemsOf(monthly)).toEqual([
      'TRIGGER_OPTION: "monthly" gives both month_days and occurrences; give one of them.',
    ]);
  });
});

describe("at on a schedule by the minute or hour", () => {
  it("is refused, at `at`", () => {
    const hourly = `{ name: hourly, type: schedule, every: { frequency: Hour, interval: 1 }, start: ${start}, at: { minutes: [15] } }`;
    expect(problemsOf(hourly)).toEqual([
      'TRIGGER_OPTION: "hourly" runs every Hour; `at` applies only to Day, Week and Month schedules. To run at a given minute, start the trigger at that minute.',
    ]);
  });

  it("is kept on a schedule by the day", () => {
    expect(problemsOf(schedule(", at: { hours: [6], minutes: [15] }"))).toEqual([]);
  });
});

describe("triggers and parameters written at the top of a flow", () => {
  it("say they belong under ingest", () => {
    const found = problems(resolve("  {}\ntriggers: []\nparameters: {}"));
    expect(found).toEqual([
      'SCHEMA: "triggers" is not a field of the document. Write it under "ingest".',
      'SCHEMA: "parameters" is not a field of the document. Write it under "ingest".',
    ]);
  });
});
