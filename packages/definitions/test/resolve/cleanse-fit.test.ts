// Whether a value fits a column's type (specification section 6.1).
import { describe, expect, it } from "vitest";
import type { Column } from "../../src/pack/index.js";
import { fitsKey, fitsValue, isNotText, isText } from "../../src/resolve/cleanse-fit.js";

const column = (logicalType: string | undefined, nullable = true): Column =>
  ({ name: "c", nullable, ...(logicalType && { logicalType }) }) as Column;

describe("isText and isNotText", () => {
  it("tell text from another type, and say nothing of a column with no type", () => {
    expect([isText(column("string")), isNotText(column("string"))]).toEqual([true, false]);
    expect([isText(column("integer")), isNotText(column("integer"))]).toEqual([false, true]);
    expect([isText(column(undefined)), isNotText(column(undefined))]).toEqual([false, false]);
  });
});

describe("fitsValue", () => {
  it("fits a value to the type", () => {
    expect(fitsValue(column("string"), "x")).toBe(true);
    expect(fitsValue(column("string"), 1)).toBe(false);
    expect(fitsValue(column("integer"), 3)).toBe(true);
    expect(fitsValue(column("integer"), 3.5)).toBe(false);
    expect(fitsValue(column("number"), 3.5)).toBe(true);
    expect(fitsValue(column("number"), "3.5")).toBe(false);
    expect(fitsValue(column("boolean"), false)).toBe(true);
    expect(fitsValue(column("boolean"), "false")).toBe(false);
    expect(fitsValue(column("date"), "2026-03-29")).toBe(true);
    expect(fitsValue(column("date"), "29/03/2026")).toBe(false);
    expect(fitsValue(column("timestamp"), "2026-03-29T01:30:00Z")).toBe(true);
    expect(fitsValue(column("timestamp"), "2026-03-29 01:30")).toBe(true);
    expect(fitsValue(column("timestamp"), "2026-03-29")).toBe(false);
  });

  it("fits null only where the column is not required", () => {
    expect(fitsValue(column("string", true), null)).toBe(true);
    expect(fitsValue(column("string", false), null)).toBe(false);
  });

  it("takes anything for a type it does not know, or none", () => {
    expect(fitsValue(column("array"), "x")).toBe(true);
    expect(fitsValue(column(undefined), 1)).toBe(true);
  });
});

describe("fitsKey", () => {
  it("fits a key, which is text, by how it reads", () => {
    expect(fitsKey(column("string"), "GBR")).toBe(true);
    expect(fitsKey(column("integer"), "-12")).toBe(true);
    expect(fitsKey(column("integer"), "1.5")).toBe(false);
    expect(fitsKey(column("number"), "1.5")).toBe(true);
    expect(fitsKey(column("number"), " ")).toBe(false);
    expect(fitsKey(column("boolean"), "true")).toBe(true);
    expect(fitsKey(column("boolean"), "yes")).toBe(false);
    expect(fitsKey(column("date"), "2026-03-29")).toBe(true);
    expect(fitsKey(column("timestamp"), "2026-03-29")).toBe(false);
    expect(fitsKey(column(undefined), "anything")).toBe(true);
  });
});
