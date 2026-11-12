// The write that never follows a link, even one made after the check (spec/cli/assistants.md,
// section 5): tested directly, so that a path changed after the check is deterministic.
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeSafely } from "../src/commands/assistant-write.js";
import { temp } from "./assistant-helpers.js";

describe("writeSafely", () => {
  it("creates a new file and rewrites an existing one", () => {
    const file = join(temp(), "AGENTS.md");
    expect(writeSafely(file, "one\n", false)).toBe(true);
    expect(readFileSync(file, "utf8")).toBe("one\n");
    expect(writeSafely(file, "two\n", true)).toBe(true);
    expect(readFileSync(file, "utf8")).toBe("two\n");
  });

  it("does not create a file through a link made after the check", () => {
    const folder = temp();
    const target = join(temp(), "elsewhere.md");
    symlinkSync(target, join(folder, "AGENTS.md"));
    expect(writeSafely(join(folder, "AGENTS.md"), "text\n", false)).toBe(false);
    expect(existsSync(target)).toBe(false);
    writeFileSync(target, "theirs\n");
    expect(writeSafely(join(folder, "AGENTS.md"), "text\n", false)).toBe(false);
    expect(readFileSync(target, "utf8")).toBe("theirs\n");
  });

  it("does not rewrite a file that was replaced by a link after the check", () => {
    const folder = temp();
    const target = join(temp(), "elsewhere.md");
    writeFileSync(target, "theirs\n");
    symlinkSync(target, join(folder, "AGENTS.md"));
    expect(writeSafely(join(folder, "AGENTS.md"), "text\n", true)).toBe(false);
    expect(readFileSync(target, "utf8")).toBe("theirs\n");
  });

  it("does not write over a folder, or a file made after the check", () => {
    const folder = temp();
    mkdirSync(join(folder, "AGENTS.md"));
    expect(writeSafely(join(folder, "AGENTS.md"), "text\n", true)).toBe(false);
    writeFileSync(join(folder, "CLAUDE.md"), "made meanwhile\n");
    expect(writeSafely(join(folder, "CLAUDE.md"), "text\n", false)).toBe(false);
    expect(readFileSync(join(folder, "CLAUDE.md"), "utf8")).toBe("made meanwhile\n");
  });
});
