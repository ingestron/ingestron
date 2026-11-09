// Coverage of intent (specification section 11.5): the entry a pack declares for a
// path and value, and the paths and values a pack does not cover.
import { describe, expect, it } from "vitest";
import {
  intentCoverageGaps,
  intentPaths,
  intentUseOf,
  type IntentUse,
  type PackInfo,
} from "../../src/index.js";

const used: IntentUse = { use: "used", does: "Reads the source as it says." };
const notYet: IntentUse = { use: "not-yet", reason: "History is not kept yet." };

/** A pack with nothing but its intent coverage. */
function packWith(intent: Record<string, IntentUse>): PackInfo {
  return {
    id: "test",
    version: 1,
    defaults: {
      naming: { catalog: "c", schema: "s", table: "t", pipeline: "p", job: "j" },
      layers: ["bronze"],
      types: {},
      quality: { required: "warn", default: "warn" },
    },
    rules: {},
    methods: {},
    intent,
  };
}

const pack = packWith({ load: used, "history=full": notYet });

describe("intentUseOf", () => {
  it("finds the entry for a path and value first", () => {
    expect(intentUseOf(pack, "history", "full")?.use).toBe("not-yet");
  });

  it("finds the entry of a path above when the path has none", () => {
    expect(intentUseOf(pack, "load.cursor")).toBe(used);
    expect(intentUseOf(pack, "load.mode", "files")).toBe(used);
  });

  it("finds the path's own entry before an entry above it", () => {
    const both = packWith({ load: notYet, "load.mode": used });
    expect(intentUseOf(both, "load.mode", "changes")).toBe(used);
  });

  it("finds nothing for a path and value no entry covers", () => {
    expect(intentUseOf(pack, "history", "latest")).toBeUndefined();
    expect(intentUseOf(packWith({}), "sequence")).toBeUndefined();
  });

  it("reads a method's coverage the same way", () => {
    expect(intentUseOf({ intent: { history: notYet } }, "history", "none")).toBe(notYet);
  });
});

describe("intentCoverageGaps", () => {
  it("lists every path and value the pack does not cover", () => {
    const gaps = intentCoverageGaps(pack);
    expect(gaps).toContain("sequence");
    expect(gaps).toContain("audit=row_hash");
    expect(gaps).toContain("history=none");
    expect(gaps).not.toContain("history=full");
    expect(gaps).not.toContain("load.mode=files");
    expect(gaps).not.toContain("load.cursor");
  });

  it("names a path with any text as a value by the path alone", () => {
    expect(intentCoverageGaps(packWith({}))).toContain("retention.log");
    expect(intentCoverageGaps(packWith({}))).not.toContain("retention.log=*");
  });

  it("is empty when every path is covered", () => {
    const all = Object.fromEntries(Object.keys(intentPaths).map((path) => [path, used]));
    expect(intentCoverageGaps(packWith(all))).toEqual([]);
  });
});
