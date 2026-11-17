// The triggers policy (specification section 11.6): defaults, the selected environment's
// entry over the common values, fixed over both, and the zone names checked.
import { memoryFiles } from "@ingestron/config";
import { describe, expect, it } from "vitest";
import { resolveDefinitions, type ResolvedModel } from "../src/index.js";
import { resolveOperations } from "../src/intent/index.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const conformance = join(import.meta.dirname, "../../../spec/definitions/conformance");
const load = (name: string) => parse(readFileSync(join(conformance, name), "utf8")) as never;
const files = (load("121-operations.yaml") as { files: Record<string, string> }).files;

const standard = {
  triggers: {
    timezone: "Europe/London",
    hours: { from: "22:00", to: "06:00" },
    environments: { dev: { hours: "any" as const } },
  },
};

describe("resolveOperations triggers", () => {
  it("gives both types and UTC when the standard says nothing", () => {
    expect(resolveOperations().triggers).toEqual({
      types: ["schedule", "tumbling-window"],
      timezone: "UTC",
    });
  });

  it("lets an environment's hours any remove the common hours", () => {
    expect(resolveOperations(standard, {}, "dev").triggers).toEqual({
      types: ["schedule", "tumbling-window"],
      timezone: "Europe/London",
    });
  });

  it("gives the hours the resolved time zone when they have none", () => {
    expect(resolveOperations(standard, {}, "prod").triggers.hours).toEqual({
      from: "22:00",
      to: "06:00",
      timezone: "Europe/London",
    });
    expect(resolveOperations(standard).triggers.hours?.timezone).toBe("Europe/London");
  });

  it("lets an environment replace the time zone, which the hours then follow", () => {
    const policy = {
      triggers: { ...standard.triggers, environments: { prod: { timezone: "UTC" } } },
    };
    expect(resolveOperations(policy, {}, "prod").triggers.hours?.timezone).toBe("UTC");
  });

  it("keeps the hours' own time zone", () => {
    const hours = { from: "01:00", to: "05:00", timezone: "Europe/Paris" };
    expect(resolveOperations({ triggers: { hours } }).triggers.hours).toEqual(hours);
  });

  it("replaces types key by key and leaves the rest", () => {
    const policy = {
      triggers: {
        timezone: "Europe/London",
        environments: { dev: { types: ["schedule" as const] } },
      },
    };
    expect(resolveOperations(policy, {}, "dev").triggers).toEqual({
      types: ["schedule"],
      timezone: "Europe/London",
    });
  });

  it("lets fixed win over the standard and its environments", () => {
    const policy = {
      triggers: {
        types: ["tumbling-window" as const],
        environments: { dev: { types: ["tumbling-window" as const] } },
      },
    };
    const fixed = { triggers: { types: ["schedule" as const] } };
    expect(resolveOperations(standard, fixed, "dev").triggers.types).toEqual(["schedule"]);
    expect(resolveOperations(policy, fixed, "dev").triggers.types).toEqual(["schedule"]);
  });

  it("lets fixed hours any clear the standard's hours", () => {
    const fixed = { triggers: { hours: "any" as const } };
    expect(resolveOperations(standard, fixed, "prod").triggers.hours).toBeUndefined();
  });
});

describe("operations.triggers in a project", () => {
  const body = (triggers: string) =>
    `apiVersion: ingestron.io/v1\nkind: Standard\nid: acme\npacks: [test@1]\noperations:\n  triggers:\n${triggers}`;
  const resolve = (triggers: string, environment = "dev") =>
    resolveDefinitions(memoryFiles({ ...files, "standard.yaml": body(triggers) }), {
      packs: [load("pack.yaml")],
      environment,
    });

  it("puts the selected environment's policy in the model", () => {
    const result = resolve(
      "    timezone: Europe/London\n    environments:\n      dev: { timezone: UTC }\n",
    );
    expect((result.model as ResolvedModel).operations.triggers.timezone).toBe("UTC");
  });

  it("reports an unknown time zone at the timezone", () => {
    const result = resolve("    types: [schedule]\n    timezone: Mars/Base\n");
    expect(result.diagnostics.map(({ code, location }) => [code, location?.line])).toEqual([
      ["TIMEZONE_NAME", 8],
    ]);
  });

  it("reports an unknown zone in the hours and in an environment", () => {
    const result = resolve(
      "    hours: { from: '01:00', to: '02:00', timezone: Mars/Hours }\n    environments:\n      prod: { timezone: Mars/Prod }\n",
    );
    expect(result.diagnostics.map(({ code, location }) => [code, location?.line])).toEqual([
      ["TIMEZONE_NAME", 7],
      ["TIMEZONE_NAME", 9],
    ]);
  });

  it("refuses a trigger type the policy does not know and malformed hours", () => {
    const result = resolve("    types: [event]\n    hours: { from: '25:00', to: '02:00' }\n");
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics.every(({ severity }) => severity === "error")).toBe(true);
  });
});
