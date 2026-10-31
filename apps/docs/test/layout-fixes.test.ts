// Reference shows values the way definitions write them, and each pack has its own page.
import { describe, expect, it } from "vitest";
import { packPages, settingRows, shown } from "../lib/reference.js";
import { extraStructure } from "../lib/search.js";

describe("setting defaults", () => {
  it("are written as in YAML, not JSON", () => {
    const every = settingRows("adf", "adf-copy").find((row) => row.name === "every");
    expect(shown(every?.default)).toBe("{ frequency: Hour, interval: 24 }");
  });
});

describe("pack pages", () => {
  it("has one page per pack", () => {
    expect(packPages()).toEqual([
      { pack: "databricks", url: "/docs/reference/packs/databricks" },
      { pack: "adf", url: "/docs/reference/packs/adf" },
    ]);
  });

  it("indexes each pack's settings on its own page", () => {
    expect(JSON.stringify(extraStructure("/docs/reference/packs/adf"))).toContain(
      "watermark_column",
    );
    expect(JSON.stringify(extraStructure("/docs/reference/packs/databricks"))).not.toContain(
      "watermark_column",
    );
  });
});
