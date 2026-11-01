// Every code has help the documentation can show; the record type makes a
// missing code a compile error, this checks the text is written as sentences.
import { describe, expect, it } from "vitest";
import { codeHelp } from "../src/index.js";

describe("code help", () => {
  it("explains every code and how to fix it, as sentences", () => {
    for (const [code, help] of Object.entries(codeHelp)) {
      expect(help.meaning, code).toMatch(/^[A-Z].*\.$/);
      expect(help.fix, code).toMatch(/^[A-Z].*\.$/);
    }
    expect(Object.keys(codeHelp)).toHaveLength(42);
  });
});
