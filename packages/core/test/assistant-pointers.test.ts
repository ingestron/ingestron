import { describe, expect, it } from "vitest";
import { guideLine, pointerFiles, pointerUpdate } from "../src/internal.js";
import { assistantCase } from "./assistant-cases.js";

const crlf = (text: string) => text.replaceAll("\n", "\r\n");

describe("pointerFiles", () => {
  it("gives CLAUDE.md and the Copilot file, in the order they are written, once", () => {
    expect(pointerFiles(["copilot", "claude"]).map((file) => file.path)).toEqual([
      "CLAUDE.md",
      ".github/copilot-instructions.md",
    ]);
    expect(pointerFiles(["codex", "cursor", "agents"])).toEqual([]);
    expect(pointerFiles([])).toEqual([]);
  });

  it("holds the exact text", () => {
    const [claude, copilot] = pointerFiles(["claude", "copilot"]);
    expect(claude!.text).toBe(
      "<!-- Ingestron: the project guide is in AGENTS.md. -->\n@AGENTS.md\n",
    );
    expect(copilot!.text).toBe(
      assistantCase("02-databricks-adf").expect.contains![".github/copilot-instructions.md"]![0],
    );
    expect(copilot!.text.split("\n")[0]).toBe(
      "See [AGENTS.md](../AGENTS.md) for this Ingestron project.",
    );
  });

  it("names no output folder and no command with an option, so it never conflicts with AGENTS.md", () => {
    const [copilot] = pointerFiles(["copilot"]);
    expect(copilot!.text).not.toMatch(/build|dist|--out|`ingestron /);
  });
});

describe("pointerUpdate", () => {
  const [claude, copilot] = pointerFiles(["claude", "copilot"]) as [
    { path: string; text: string },
    { path: string; text: string },
  ];

  it("writes a new or empty file whole", () => {
    expect(pointerUpdate(claude.path, undefined, claude.text)).toEqual({
      kind: "new",
      text: claude.text,
    });
    expect(pointerUpdate(copilot.path, "", copilot.text)).toEqual({
      kind: "new",
      text: copilot.text,
    });
  });

  it("is current when CLAUDE.md has the line @AGENTS.md, or the Copilot file its first line", () => {
    expect(pointerUpdate(claude.path, claude.text, claude.text)).toEqual({ kind: "current" });
    expect(pointerUpdate(claude.path, "# Mine\r\n@AGENTS.md\r\nmore", claude.text)).toEqual({
      kind: "current",
    });
    expect(pointerUpdate(copilot.path, `x\n\n${copilot.text}`, copilot.text)).toEqual({
      kind: "current",
    });
  });

  it("appends the two lines to CLAUDE.md, each on a line of its own, in the file's line ending", () => {
    expect(pointerUpdate(claude.path, "# Mine", claude.text)).toEqual({
      kind: "added",
      text: "# Mine\n<!-- Ingestron: the project guide is in AGENTS.md. -->\n@AGENTS.md\n",
    });
    expect(pointerUpdate(claude.path, "# Mine\r\n", claude.text)).toEqual({
      kind: "added",
      text: "# Mine\r\n<!-- Ingestron: the project guide is in AGENTS.md. -->\r\n@AGENTS.md\r\n",
    });
    expect(pointerUpdate(claude.path, "see @AGENTS.md.\n", claude.text).kind).toBe("added");
  });

  it("appends the whole Copilot text after one blank line, in the file's line ending", () => {
    expect(pointerUpdate(copilot.path, "# Rules\nBe brief.\n", copilot.text)).toEqual({
      kind: "added",
      text: `# Rules\nBe brief.\n\n${copilot.text}`,
    });
    expect(pointerUpdate(copilot.path, "# Rules\r\nBe brief.", copilot.text)).toEqual({
      kind: "added",
      text: `# Rules\r\nBe brief.\r\n\r\n${crlf(copilot.text)}`,
    });
  });
});

describe("guideLine", () => {
  it("writes the lines of init and assistant add", () => {
    const line = (file: string, kind: Parameters<typeof guideLine>[1]) =>
      guideLine(file, kind, "write");
    expect(line("AGENTS.md", "new")).toBe("AGENTS.md: written");
    expect(line("CLAUDE.md", "new")).toBe("CLAUDE.md: written");
    expect(line(".github/copilot-instructions.md", "new")).toBe(
      ".github/copilot-instructions.md: written",
    );
    expect(line("AGENTS.md", "appended")).toBe("AGENTS.md: added the Ingestron section");
    expect(line("AGENTS.md", "updated")).toBe("AGENTS.md: updated the Ingestron section");
    expect(line("AGENTS.md", "current")).toBe("AGENTS.md: up to date");
    expect(line("CLAUDE.md", "current")).toBe("CLAUDE.md: up to date");
    expect(line("CLAUDE.md", "added")).toBe("CLAUDE.md: added @AGENTS.md");
    expect(line(".github/copilot-instructions.md", "added")).toBe(
      ".github/copilot-instructions.md: added the link to AGENTS.md",
    );
    expect(line("AGENTS.md", "edited")).toBe(
      "AGENTS.md: the Ingestron section was edited by hand, so it was not updated. Move your notes outside it, or delete both markers to keep it as your own.",
    );
    expect(line("CLAUDE.md", "not-regular")).toBe(
      "CLAUDE.md: not a regular file, so nothing was written to it.",
    );
    expect(line("AGENTS.md", "user")).toBeUndefined();
  });

  it("writes the lines for a file that cannot be read or written, with the error's code", () => {
    expect(guideLine("AGENTS.md", "unreadable", "write", "EACCES")).toBe(
      "AGENTS.md: could not be read (EACCES), so nothing was written to it.",
    );
    expect(guideLine("CLAUDE.md", "unwritable", "write", "EROFS")).toBe(
      "CLAUDE.md: could not be written (EROFS).",
    );
    expect(guideLine("AGENTS.md", "unreadable", "write")).toBe(
      "AGENTS.md: could not be read (error), so nothing was written to it.",
    );
    expect(guideLine("AGENTS.md", "unwritable", "write")).toBe(
      "AGENTS.md: could not be written (error).",
    );
  });

  it("writes what plan says, and nothing for what it does not report", () => {
    expect(guideLine("AGENTS.md", "updated", "plan")).toBe(
      "AGENTS.md: the Ingestron section would change",
    );
    expect(guideLine("AGENTS.md", "edited", "plan")).toBe(
      "AGENTS.md: the Ingestron section was edited by hand, so apply will not update it. Move your notes outside it, or delete both markers to keep it as your own.",
    );
    for (const kind of ["current", "user", "not-regular", "unreadable", "unwritable"] as const)
      expect(guideLine("AGENTS.md", kind, "plan")).toBeUndefined();
  });

  it("writes what apply says, and nothing for what it does not report", () => {
    expect(guideLine("AGENTS.md", "updated", "apply")).toBe(
      "AGENTS.md: updated the Ingestron section",
    );
    expect(guideLine("AGENTS.md", "edited", "apply")).toBe(
      "AGENTS.md: the Ingestron section was edited by hand, so it was not updated. Move your notes outside it, or delete both markers to keep it as your own.",
    );
    for (const kind of ["current", "user", "not-regular", "unreadable", "unwritable"] as const)
      expect(guideLine("AGENTS.md", kind, "apply")).toBeUndefined();
  });
});
