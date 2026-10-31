// The commands and flags the documentation lists are the ones --help shows.
import { describe, expect, it } from "vitest";
import { usage } from "../src/args.js";
import { commands, flags } from "../src/index.js";

describe("command metadata", () => {
  it("lists every command and flag in the usage text", () => {
    expect(commands.map((command) => command.name)).toEqual([
      "plan",
      "apply",
      "check",
      "compare",
      "contract",
      "request",
      "schemas",
      "init",
    ]);
    for (const { name, summary } of commands)
      expect(usage).toContain(`${name.padEnd(10)}${summary}`);
    for (const { flag, summary } of flags)
      expect(usage).toMatch(new RegExp(`  ${escape(flag)} {2,}${escape(summary)}`));
  });
});

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
