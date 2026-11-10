// What a layer does (specification section 5): the duty check that cleansing, deduplicate
// and quarantine settings ask, and the actions of a layer that does not check.
import { describe, expect, it } from "vitest";
import type { Context } from "../../src/context/index.js";
import { createReporter, type Source } from "../../src/diagnostics/index.js";
import type { Contract } from "../../src/pack/index.js";
import { checksIn, doesOf, requireDuty } from "../../src/resolve/layer-duties.js";

const layers = [
  { name: "bronze", does: "raw" as const },
  { name: "silver", does: ["cleanse", "deduplicate", "check"] as const },
  { name: "gold", does: ["check"] as const },
  "archive",
];
const at = { document: { locate: () => undefined }, pointer: "/x" } as unknown as Source;

function contextOf() {
  const reporter = createReporter();
  const context = { standard: { value: { layers } }, reporter } as unknown as Context;
  return { context, reporter };
}

describe("doesOf", () => {
  it("gives raw, the list as written, or nothing", () => {
    const { context } = contextOf();
    expect(doesOf(context, "bronze")).toBe("raw");
    expect(doesOf(context, "silver")).toEqual(["cleanse", "deduplicate", "check"]);
    expect(doesOf(context, "archive")).toBeUndefined();
    expect(doesOf(context, "missing")).toBeUndefined();
  });
});

describe("requireDuty", () => {
  it("accepts a duty the layer lists, and any duty where the layer gives no does", () => {
    const { context, reporter } = contextOf();
    expect(requireDuty(context, { layer: "silver", does: ["cleanse"] }, "cleanse", "x", at)).toBe(
      true,
    );
    expect(requireDuty(context, { layer: "archive" }, "quarantine", "x", at)).toBe(true);
    expect(reporter.diagnostics).toEqual([]);
  });

  it("reports an error at the setting that names the layers that do the duty", () => {
    const { context, reporter } = contextOf();
    const table = { layer: "bronze", does: "raw" as const };
    expect(requireDuty(context, table, "cleanse", 'a "trim" cleansing rule', at)).toBe(false);
    expect(reporter.diagnostics).toMatchObject([
      {
        code: "LAYER_RESPONSIBILITY",
        severity: "error",
        message:
          'The layer "bronze" does not list cleanse in its does, so a "trim" cleansing rule cannot be set here.',
        hint: "Layers that do cleanse: silver. Or add `cleanse` to this layer's `does`.",
      },
    ]);
  });

  it("names every layer that does it, and falls back to adding the duty", () => {
    const { context, reporter } = contextOf();
    const table = { layer: "silver", does: ["cleanse"] as ("cleanse" | "check")[] };
    requireDuty(context, table, "check", "x", at);
    requireDuty(context, table, "quarantine", "y", at);
    expect(reporter.diagnostics.map((item) => item.hint)).toEqual([
      "Layers that do check: silver, gold. Or add `check` to this layer's `does`.",
      "Add `quarantine` to the layer's `does`.",
    ]);
  });
});

describe("checksIn", () => {
  const contract = () =>
    ({
      columns: [{ name: "id", nullable: false }],
      checks: [{ name: "positive", check: "id > 0" }],
      tableChecks: [{ name: "id_unique", action: "fail" }],
    }) as unknown as Contract;
  const own = [{ name: "small", check: "id < 9", action: "fail" as const }];
  const actions = (context: Context, layer: string, held: Contract) => {
    const { expectations, does } = checksIn(context, layer, held, own);
    return { actions: expectations.map((item) => item.action), does };
  };
  const { context } = contextOf();
  const standard = context.standard.value as { quality?: unknown };
  standard.quality = { required: "fail", default: "drop" };
  Object.assign(context, { pack: { defaults: {} } });

  it("makes every action warn where the layer does not check, table checks included", () => {
    const held = contract();
    expect(actions(context, "bronze", held)).toEqual({
      actions: ["warn", "warn", "warn"],
      does: "raw",
    });
    expect(held.tableChecks.map((item) => item.action)).toEqual(["warn"]);
  });

  it("leaves them where the layer checks", () => {
    const held = contract();
    expect(actions(context, "gold", held)).toEqual({
      actions: ["fail", "drop", "fail"],
      does: ["check"],
    });
    expect(held.tableChecks.map((item) => item.action)).toEqual(["fail"]);
  });

  it("gives the table its own copy of the list, so the standard cannot be changed through it", () => {
    const { does } = checksIn(context, "gold", contract(), own);
    expect(does).toEqual(["check"]);
    expect(does).not.toBe(doesOf(context, "gold"));
    (does as string[]).push("cleanse");
    expect(doesOf(context, "gold")).toEqual(["check"]);
  });

  it("leaves them, and gives no does, where the layer gives none", () => {
    const held = contract();
    expect(checksIn(context, "archive", held, own)).not.toHaveProperty("does");
    expect(actions(context, "archive", held).actions).toEqual(["fail", "drop", "fail"]);
    expect(held.tableChecks.map((item) => item.action)).toEqual(["fail"]);
  });
});
