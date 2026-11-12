// `assistant add`: the files written, and what is never overwritten (spec/cli/assistants.md, section 5).
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { files, ingestron, listed, project, read, temp } from "./assistant-helpers.js";

describe("assistant add", () => {
  it("writes, then says up to date with the same bytes", () => {
    const folder = project();
    const first = ingestron(folder, ["assistant", "add", "copilot"]);
    expect(first.code, first.output).toBe(0);
    expect(first.output).toBe("AGENTS.md: written\n.github/copilot-instructions.md: written\n");
    const bytes = [read(folder, "AGENTS.md"), read(folder, ".github/copilot-instructions.md")];
    const second = ingestron(folder, ["assistant", "add", "copilot"]);
    expect(second.code).toBe(0);
    expect(second.output).toBe(
      "AGENTS.md: up to date\n.github/copilot-instructions.md: up to date\n",
    );
    expect([read(folder, "AGENTS.md"), read(folder, ".github/copilot-instructions.md")]).toEqual(
      bytes,
    );
  });

  it("writes the guide's output folder relative to the project folder", () => {
    const folder = project();
    const { code } = ingestron(folder, ["assistant", "add", "agents", "--out", "out/gen"]);
    expect(code).toBe(0);
    expect(read(folder, "AGENTS.md")).toContain("`out/gen/duckdb/` (a folder per environment)");
  });

  it("takes --definitions as the project folder", () => {
    const folder = temp();
    const inner = join(folder, "app");
    mkdirSync(inner);
    for (const [path, text] of Object.entries(files)) writeFileSync(join(inner, path), text);
    const { code } = ingestron(folder, ["assistant", "add", "claude", "--definitions", "app"]);
    expect(code).toBe(0);
    expect(listed(folder).sort()).toEqual(
      ["app/AGENTS.md", "app/CLAUDE.md", "app/project.yaml", "app/standard.yaml"].sort(),
    );
  });

  it("needs a project.yaml", () => {
    const folder = temp();
    const { code, output } = ingestron(folder, ["assistant", "add", "agents"]);
    expect(code).toBe(1);
    expect(output).toBe("No project.yaml in ..\n");
    mkdirSync(join(folder, "sub"));
    expect(ingestron(folder, ["assistant", "add", "agents", "--definitions", "sub"]).output).toBe(
      "No project.yaml in sub.\n",
    );
    expect(listed(folder)).toEqual([]);
  });

  it("writes nothing and exits 1 when there is no guide", () => {
    const folder = project({ "project.yaml": "environments: {}\n" });
    const { code, output } = ingestron(folder, ["assistant", "add", "claude"]);
    expect(code).toBe(1);
    expect(output).toBe("No guide: project.yaml has no id.\n");
    expect(existsSync(join(folder, "CLAUDE.md"))).toBe(false);
    expect(existsSync(join(folder, "AGENTS.md"))).toBe(false);
  });

  it("never follows a link: the target's bytes are unchanged", () => {
    const folder = project();
    const outside = join(temp(), "outside.md");
    writeFileSync(outside, "someone else's file\n");
    symlinkSync(outside, join(folder, "AGENTS.md"));
    const { code, output } = ingestron(folder, ["assistant", "add", "agents"]);
    expect(code).toBe(1);
    expect(output).toBe("AGENTS.md: not a regular file, so nothing was written to it.\n");
    expect(readFileSync(outside, "utf8")).toBe("someone else's file\n");
  });

  it("says a .github that is a file is not a regular file, and writes the others", () => {
    const folder = project({ ".github": "not a folder\n" });
    const { code, output } = ingestron(folder, ["assistant", "add", "claude,copilot"]);
    expect(code).toBe(1);
    expect(output).toBe(
      [
        "AGENTS.md: written",
        "CLAUDE.md: written",
        ".github/copilot-instructions.md: not a regular file, so nothing was written to it.",
        "",
      ].join("\n"),
    );
    expect(read(folder, ".github")).toBe("not a folder\n");
  });

  it("does not write through a .github that is a link", () => {
    const folder = project();
    const elsewhere = temp();
    symlinkSync(elsewhere, join(folder, ".github"));
    const { code, output } = ingestron(folder, ["assistant", "add", "copilot"]);
    expect(code).toBe(1);
    expect(output).toContain(
      ".github/copilot-instructions.md: not a regular file, so nothing was written to it.",
    );
    expect(listed(elsewhere)).toEqual([]);
  });

  it("adds to the files that are there", () => {
    const folder = project({ "CLAUDE.md": "# Mine\n", "AGENTS.md": "# Notes\n" });
    const { code, output } = ingestron(folder, ["assistant", "add", "claude"]);
    expect(code).toBe(0);
    expect(output).toBe("AGENTS.md: added the Ingestron section\nCLAUDE.md: added @AGENTS.md\n");
    expect(read(folder, "CLAUDE.md")).toBe(
      "# Mine\n<!-- Ingestron: the project guide is in AGENTS.md. -->\n@AGENTS.md\n",
    );
  });
});
