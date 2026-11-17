// A flow's triggers and parameters (specification section 5.1): what the model holds, and the
// problems found before anything is generated.
import { describe, expect, it } from "vitest";
import type { ResolvedModel } from "../../src/index.js";
import { problems, resolve } from "./project.js";

const hourly = `
    - { name: hourly, type: tumbling-window, every: { frequency: Hour, interval: 1 }, start: "2026-12-01T00:00:00Z" }`;
const daily = (extra = "") =>
  `
    - { name: daily, type: schedule, every: { frequency: Day, interval: 1 }, start: "2026-12-01T00:00:00Z"${extra} }`;

const triggers = (list: string, parameters = "") =>
  `  ${parameters ? `parameters:${parameters}\n  ` : ""}triggers:${list}`;
const ingestOf = (result: ReturnType<typeof resolve>, table = 0) =>
  (result.model as ResolvedModel).tables[table]!.ingest!;

describe("what the model holds", () => {
  it("has neither triggers nor parameters for a flow that writes none", () => {
    const ingest = ingestOf(resolve("  with: {}"));
    expect(ingest).not.toHaveProperty("triggers");
    expect(ingest).not.toHaveProperty("parameters");
  });

  it("gives every table of the flow the flow's triggers and parameters", () => {
    const result = resolve(
      triggers(hourly + daily(), "\n    min_date: { type: date, default: '2020-01-01' }"),
      undefined,
      2,
    );
    expect(result.diagnostics).toEqual([]);
    for (const table of [0, 1]) {
      const ingest = ingestOf(result, table);
      expect(ingest.parameters).toEqual({ min_date: { type: "date", default: "2020-01-01" } });
      expect(ingest.triggers?.map(({ flow, name }) => [flow, name])).toEqual([
        ["shop", "hourly"],
        ["shop", "daily"],
      ]);
    }
  });

  it("keeps parameters of a flow that writes no triggers", () => {
    const result = resolve("  parameters:\n    n: { type: int, default: 3 }");
    expect(ingestOf(result).parameters).toEqual({ n: { type: "int", default: 3 } });
    expect(ingestOf(result)).not.toHaveProperty("triggers");
  });

  it("takes the zone from the trigger, else the standard, else UTC", () => {
    const own = daily(", timezone: Europe/Paris");
    const zone = (operations?: string) =>
      ingestOf(resolve(triggers(own + daily().replace("daily", "other")), operations)).triggers!;
    const standard = "  schedule: { per: flow }\n  triggers: { timezone: Europe/London }\n";
    expect(zone(standard).map((trigger) => trigger.timezone)).toEqual([
      "Europe/Paris",
      "Europe/London",
    ]);
    expect(zone().map((trigger) => trigger.timezone)).toEqual(["Europe/Paris", "UTC"]);
  });

  it("holds only the options the trigger writes, and the place it is written", () => {
    const trigger = ingestOf(resolve(triggers(hourly))).triggers![0]!;
    expect(Object.keys(trigger).sort()).toEqual(
      ["at_source", "every", "flow", "name", "parameters", "start", "timezone", "type"].sort(),
    );
    expect(trigger.at_source.pointer).toBe("/ingest/triggers/0");
  });

  it("can be cloned, as a pack does when it plans an environments build", () => {
    const model = resolve(triggers(hourly)).model as ResolvedModel;
    const copy = structuredClone(model);
    expect(copy.tables[0]!.ingest!.triggers![0]!.at_source.pointer).toBe("/ingest/triggers/0");
  });
});

describe("who may write triggers", () => {
  it("refuses them under one schedule for the project", () => {
    expect(problems(resolve(triggers(hourly), "  schedule: { per: project }\n"))).toEqual([
      "TRIGGER_NOT_ALLOWED: The standard keeps one schedule for the project (`operations.schedule.per: project`); flows cannot write triggers.",
    ]);
  });

  it("refuses a type the standard does not allow", () => {
    const standard = "  schedule: { per: flow }\n  triggers: { types: [schedule] }\n";
    expect(problems(resolve(triggers(daily() + hourly), standard))).toEqual([
      "TRIGGER_NOT_ALLOWED: The standard allows only schedule triggers.",
    ]);
  });

  it("refuses them when the standard's trigger is not a schedule", () => {
    expect(
      problems(resolve(triggers(hourly), "  schedule: { per: flow }\n  trigger: upstream\n")),
    ).toEqual([
      "TRIGGER_NOT_ALLOWED: The standard's `operations.trigger` is upstream, so flows cannot write schedule or tumbling-window triggers.",
    ]);
  });
});
