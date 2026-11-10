import { describe, expect, it } from "vitest";
import { matchesImport } from "../../src/index.js";

describe("matchesImport", () => {
  it.each([
    ["flows/*.yaml", "flows/a.yaml", true],
    ["./flows/*.yaml", "flows/a.yaml", true],
    [".//flows//*.yaml", "flows/a.yaml", true],
    ["flows//legacy/**", "flows/legacy/x/a.yaml", true],
    ["a/../b/*.yaml", "b/c.yaml", true],
    ["a/../b/*.yaml", "a/c.yaml", false],
    ["flows/*.yaml", "flows/legacy/a.yaml", false],
    ["**/a.yaml", "a.yaml", true],
  ])("pattern %s against %s is %s", (pattern, path, expected) => {
    expect(matchesImport(pattern, path)).toBe(expected);
  });

  it.each([
    "../flows/*.yaml",
    "a/../../b.yaml",
    "/flows/*.yaml",
    "flows\\*.yaml",
    "https://x/*.yaml",
  ])("a pattern imports refuses, %s, matches nothing", (pattern) => {
    expect(matchesImport(pattern, "flows/a.yaml")).toBe(false);
    expect(matchesImport(pattern, "/flows/a.yaml")).toBe(false);
  });
});
