import { describe, expect, it } from "vitest";
import { assistantNames, assistantQuestion, readAssistantNames } from "../src/internal.js";

describe("readAssistantNames", () => {
  it("takes a comma-separated list or repeated values, in the order of the names", () => {
    expect(readAssistantNames(["copilot,claude"])).toEqual(["copilot", "claude"]);
    expect(readAssistantNames(["claude", "copilot"])).toEqual(["copilot", "claude"]);
    expect(readAssistantNames(["agents,claude", "claude"])).toEqual(["claude", "agents"]);
  });

  it("gives none, nothing or an empty answer as no names", () => {
    expect(readAssistantNames(["none"])).toEqual([]);
    expect(readAssistantNames([])).toEqual([]);
    expect(readAssistantNames([""])).toEqual([]);
  });

  it("says what is wrong with an unknown name", () => {
    expect(readAssistantNames(["gpt"])).toEqual({
      mistake:
        'Unknown assistant "gpt". Choose from copilot, claude, codex, cursor, agents or none.',
    });
    expect(readAssistantNames(["copilot,gpt"])).toEqual({
      mistake:
        'Unknown assistant "gpt". Choose from copilot, claude, codex, cursor, agents or none.',
    });
  });

  it("refuses none with another name", () => {
    expect(readAssistantNames(["none,agents"])).toEqual({
      mistake: '"none" cannot be given with another assistant.',
    });
    expect(readAssistantNames(["none", "claude"])).toEqual({
      mistake: '"none" cannot be given with another assistant.',
    });
  });

  it("can require a name, as assistant add does", () => {
    const needs = {
      mistake: "assistant add needs one or more of copilot, claude, codex, cursor or agents.",
    };
    expect(readAssistantNames([], true)).toEqual(needs);
    expect(readAssistantNames(["none"], true)).toEqual(needs);
    expect(readAssistantNames(["codex"], true)).toEqual(["codex"]);
  });

  it("lists the names and asks the question", () => {
    expect(assistantNames).toEqual(["copilot", "claude", "codex", "cursor", "agents"]);
    expect(assistantQuestion).toBe(
      "AI assistant files (copilot, claude, codex, cursor, agents or none) [none]: ",
    );
  });
});
