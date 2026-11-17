// How a flow's triggers load a table (specification section 5.1): the lookback a schedule needs
// on an incremental table, and the key a trigger that reloads or overlaps rows needs.
import { describe, expect, it } from "vitest";
import type { ResolvedTable } from "../../src/index.js";
import { checkLoads } from "../../src/resolve/trigger-loads.js";
import { durationText } from "../../src/triggers/duration.js";
import { problems, resolve, unkeyed } from "../triggers/project.js";
import { trigger } from "../triggers/trigger.js";

const start = '"2026-12-01T00:00:00Z"';
const schedule = (extra = "", name = "hourly") =>
  `{ name: ${name}, type: schedule, every: { frequency: Hour, interval: 1 }, start: ${start}${extra} }`;
const window = `{ name: windows, type: tumbling-window, every: { frequency: Hour, interval: 1 }, start: ${start} }`;

/** The problems of a flow with these triggers, and flow-level intent, over two tables. */
function loads(
  triggers: string[],
  intent = "load: { mode: incremental }\nhistory: latest",
  key = true,
) {
  const flow = `  triggers: [${triggers.join(", ")}]\n${intent}`;
  return problems(resolve(flow, undefined, 1, key ? undefined : unkeyed));
}

describe("TRIGGER_LOOKBACK", () => {
  it("is an error for a schedule on an incremental table with no lookback and no load", () => {
    expect(loads([schedule()])).toEqual([
      'TRIGGER_LOOKBACK: "hourly" runs an incremental table on a schedule; give it a `lookback`, or `load: full`.',
    ]);
  });

  it("is an error for a lookback shorter than the longest gap between runs", () => {
    expect(loads([schedule(", lookback: 30m")])).toEqual([
      `TRIGGER_LOOKBACK: "hourly"'s lookback 30m is shorter than its longest gap between runs, 1h.`,
    ]);
  });

  it("passes a lookback of two hours, or exactly the gap, on an hourly schedule", () => {
    expect(loads([schedule(", lookback: 2h")])).toEqual([]);
    expect(loads([schedule(", lookback: 60m")])).toEqual([]);
  });

  it("accepts load: full in place of a lookback", () => {
    expect(loads([schedule(", parameters: { load: full }")])).toEqual([]);
  });

  it("says the gap of a daily schedule at two times in the largest exact unit", () => {
    const daily = `{ name: twice, type: schedule, every: { frequency: Day, interval: 1 }, start: ${start}, at: { hours: [6, 18] }, lookback: 11h }`;
    expect(loads([daily])).toEqual([
      `TRIGGER_LOOKBACK: "twice"'s lookback 11h is shorter than its longest gap between runs, 12h.`,
    ]);
  });

  it("does not judge a tumbling window, a table that is not incremental, or the default trigger", () => {
    expect(loads([window])).toEqual([]);
    expect(loads([schedule()], "history: latest")).toEqual([]);
    expect(problems(resolve("  with: {}", undefined, 1))).toEqual([]);
  });

  it("is reported at the trigger", () => {
    const result = resolve(
      `  triggers: [${schedule()}]\nload: { mode: incremental }\nhistory: latest`,
    );
    expect(result.diagnostics[0]?.location).toMatchObject({ file: "shop.yaml", line: 6 });
    expect(result.diagnostics[0]?.severity).toBe("error");
  });
});

describe("TRIGGER_KEY", () => {
  it("is an error for a tumbling window on an incremental table with no primary key", () => {
    expect(loads([window], undefined, false)).toEqual([
      'TRIGGER_KEY: "windows" reloads or overlaps rows of orders, which has no primary key; declare one in its contract, or in its source metadata.',
    ]);
  });

  it("is an error when the store keeps every row as it arrived", () => {
    expect(loads([window], "load: { mode: incremental }\nhistory: none")).toEqual([
      'TRIGGER_KEY: "windows" reloads or overlaps rows of orders, whose store keeps every row as it arrived (`history: none`), so overlapping rows would be duplicated.',
    ]);
  });

  it("covers a full reload of a table that is not incremental", () => {
    const reload = schedule(", parameters: { load: full }", "reload");
    expect(loads([reload], "history: none")).toEqual([
      'TRIGGER_KEY: "reload" reloads or overlaps rows of orders, whose store keeps every row as it arrived (`history: none`), so overlapping rows would be duplicated.',
    ]);
    expect(loads([reload], "history: latest")).toEqual([]);
  });

  it("passes a table with a key and history: latest", () => {
    expect(loads([window])).toEqual([]);
  });

  it("does not judge a table that is not incremental and is not reloaded", () => {
    expect(loads([window], "history: none")).toEqual([]);
  });

  it("reports the lookback first, and the missing key as well", () => {
    expect(loads([schedule()], undefined, false).map((text) => text.split(":")[0])).toEqual([
      "TRIGGER_LOOKBACK",
      "TRIGGER_KEY",
    ]);
  });
});

/** The context and table `checkLoads` needs, for a table the project cannot make. */
function fake(table: Partial<ResolvedTable>) {
  const found: string[] = [];
  const context = {
    reporter: { error: (code: string) => found.push(code) },
  } as unknown as Parameters<typeof checkLoads>[0];
  const full = {
    name: "orders",
    contract: { primaryKey: ["id"] },
    intent: { load: { mode: "incremental" }, history: "latest" },
    ingest: { settings: {}, triggers: [trigger({ parameters: { load: "full" } })] },
    ...table,
  } as unknown as ResolvedTable;
  checkLoads(context, full);
  return found;
}

describe("checkLoads", () => {
  const ingest = (settings: Record<string, unknown>) =>
    ({
      settings,
      triggers: [trigger({ parameters: { load: "full" } })],
    }) as ResolvedTable["ingest"];

  it("counts a table that ends at the landed files as history: none", () => {
    const chosen = { by: "pack-default" } as ResolvedTable["endsAtFiles"];
    expect(fake({ endsAtFiles: chosen })).toEqual(["TRIGGER_KEY"]);
    expect(fake({})).toEqual([]);
  });

  describe("a snapshot layout", () => {
    const snapshot = ingest({ layout: "snapshot" });
    const full = (history: string) => ({ intent: { history } }) as Partial<ResolvedTable>;
    const unkeyed = { contract: { primaryKey: [] } } as unknown as Partial<ResolvedTable>;
    const atFiles = { endsAtFiles: { by: "pack-default" } } as Partial<ResolvedTable>;

    it("exempts a full table whose landed file each run replaces", () => {
      expect(fake({ ...full("none"), ...atFiles, ingest: ingest({}) })).toEqual(["TRIGGER_KEY"]);
      expect(fake({ ...full("none"), ...atFiles, ingest: snapshot })).toEqual([]);
    });

    it("exempts a full table whose store replaces its rows, even with no key", () => {
      expect(fake({ ...full("latest"), ...unkeyed, ingest: ingest({}) })).toEqual(["TRIGGER_KEY"]);
      expect(fake({ ...full("latest"), ...unkeyed, ingest: snapshot })).toEqual([]);
    });

    it("keeps TRIGGER_KEY for a full reload into a store that appends", () => {
      expect(fake({ ...full("none"), ingest: snapshot })).toEqual(["TRIGGER_KEY"]);
    });

    it("keeps TRIGGER_KEY for an incremental table", () => {
      const incremental = { intent: { load: { mode: "incremental" }, history: "none" } };
      expect(fake({ ...(incremental as Partial<ResolvedTable>), ingest: snapshot })).toEqual([
        "TRIGGER_KEY",
      ]);
      expect(fake({ ...unkeyed, ingest: snapshot })).toEqual(["TRIGGER_KEY"]);
    });
  });

  it("checks nothing for a table with no triggers", () => {
    expect(fake({ ingest: { settings: {} } as ResolvedTable["ingest"] })).toEqual([]);
  });
});

describe("durationText", () => {
  it("writes a length in the largest unit that holds it exactly", () => {
    expect(durationText(3_600_000)).toBe("1h");
    expect(durationText(5_400_000)).toBe("90m");
    expect(durationText(172_800_000)).toBe("2d");
    expect(durationText(45_000)).toBe("45s");
  });
});
