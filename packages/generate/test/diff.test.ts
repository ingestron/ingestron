import { describe, expect, it } from "vitest";
import { lineDiff } from "../src/diff.js";

describe("lineDiff", () => {
  it("shows changed lines with two lines of context", () => {
    const before = "a\nb\nc\nd\ne\nf\ng\n";
    const after = "a\nb\nc\nD\ne\nf\ng\n";
    expect(lineDiff(before, after)).toBe(
      ["@@ -2,5 +2,5 @@", " b", " c", "-d", "+D", " e", " f"].join("\n"),
    );
  });

  it("shows additions at the end", () => {
    expect(lineDiff("a\n", "a\nb\n")).toBe(["@@ -1,1 +1,2 @@", " a", "+b"].join("\n"));
  });

  it("summarises instead of comparing very large files", () => {
    const big = "x\n".repeat(5000);
    expect(lineDiff(big, big + "y\n")).toBe(
      "(5000 → 5001 lines; too large to compare line by line)",
    );
  });
});
