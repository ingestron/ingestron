// The arguments of `init --assistant` and `assistant add` (spec/cli/assistants.md, section 1).
import { describe, expect, it } from "vitest";
import { readArgs } from "../src/terminal/index.js";

describe("the arguments", () => {
  it("rejects an unknown name for init", () => {
    expect(readArgs(["init", "x", "--assistant", "gpt"])).toEqual({
      mistake:
        'Unknown assistant "gpt". Choose from copilot, claude, codex, cursor, agents or none.',
    });
  });

  it("needs names for assistant add", () => {
    expect(readArgs(["assistant", "add"])).toEqual({
      mistake: "assistant add needs one or more of copilot, claude, codex, cursor or agents.",
    });
  });

  it("takes the names once each, in the order of the spec", () => {
    const options = readArgs(["assistant", "add", "claude", "copilot,claude"]);
    expect(options).toMatchObject({ command: "assistant", assistant: { action: "add" } });
    expect((options as { assistant: { names: string[] } }).assistant.names).toEqual([
      "copilot",
      "claude",
    ]);
  });

  it("keeps the raw values of --assistant for init", () => {
    const options = readArgs([
      "init",
      "x",
      "--assistant",
      "claude,copilot",
      "--assistant",
      "agents",
    ]);
    expect(options).toMatchObject({ init: { assistants: ["claude,copilot", "agents"] } });
  });

  it("refuses --assistant on any other command", () => {
    for (const command of ["plan", "check", "request", "source request", "assistant add agents"])
      expect(readArgs([...command.split(" "), "--assistant", "claude"])).toEqual({
        mistake: "--assistant is only for init.",
      });
  });

  it("needs add after assistant", () => {
    expect(readArgs(["assistant"])).toEqual({ mistake: "assistant needs add <names>." });
    expect(readArgs(["assistant", "remove", "claude"])).toEqual({
      mistake: 'Unknown command "assistant remove claude".',
    });
  });
});
