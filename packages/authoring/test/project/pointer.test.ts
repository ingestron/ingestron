// The JSON Pointer of a path of keys, which the fixes use to name where an edit goes: a key with
// `~` or `/` in it is escaped, so that it is one segment (RFC 6901).
import { describe, expect, it } from "vitest";
import { pointerOf } from "../../src/project/index.js";

describe("pointerOf", () => {
  it("joins the segments, each after a slash", () => {
    expect(pointerOf(["tables", "customers", "contract"])).toBe("/tables/customers/contract");
    expect(pointerOf([])).toBe("");
  });

  it("escapes `~` as `~0` and `/` as `~1`, `~` first so a `~1` written is not doubled up", () => {
    expect(pointerOf(["a~b", "c/d", "~1"])).toBe("/a~0b/c~1d/~01");
  });
});
