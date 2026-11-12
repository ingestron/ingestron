// `init --assistant`: the files, the question, and what is never read (spec/cli/assistants.md, section 5).
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ingestron, listed, project, read, temp } from "./assistant-helpers.js";

describe("secrets are never read", () => {
  const sentinel = "sentinel-value-7";

  it("keeps a .env file, a .env.dev file and the environment out of every file written", () => {
    const more = {
      ".env": `API_TOKEN=${sentinel}\n`,
      ".env.dev": `API_TOKEN=${sentinel}\n`,
      "sales.yaml":
        "apiVersion: ingestron.io/v1\nkind: Flow\nid: sales\nnote: ${envvar:API_TOKEN}\n",
    };
    process.env.API_TOKEN = sentinel;
    try {
      const folder = project(more);
      expect(ingestron(folder, ["assistant", "add", "claude,copilot"]).code).toBe(0);
      const made = ["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md"];
      expect(read(folder, "AGENTS.md")).toContain("This project uses: `API_TOKEN`.");
      for (const path of made) expect(read(folder, path)).not.toContain(sentinel);
      const into = temp();
      for (const [path, text] of Object.entries(more)) writeFileSync(join(into, path), text);
      const created = ingestron(into, [
        "init",
        "app",
        "--template",
        "duckdb",
        "--assistant",
        "claude,copilot",
        "--yes",
      ]);
      expect(created.code, created.output).toBe(0);
      for (const path of made) expect(read(join(into, "app"), path)).not.toContain(sentinel);
    } finally {
      delete process.env.API_TOKEN;
    }
  });
});

describe("init", () => {
  const without = () => {
    const folder = temp();
    const { code, output } = ingestron(folder, ["init", "app", "--template", "duckdb", "--yes"]);
    expect(code, output).toBe(0);
    return listed(join(folder, "app")).sort();
  };

  it("writes the same files as before without --assistant", () => {
    const list = without();
    expect(list).not.toContain("AGENTS.md");
    expect(list).not.toContain("CLAUDE.md");
    expect(list.filter((path) => !path.startsWith("build/")).length).toBe(12);
  });

  it("writes only the files the names ask for, directly after the Created line", () => {
    const before = without().filter((path) => !path.startsWith("build/"));
    const folder = temp();
    const { code, output } = ingestron(folder, [
      "init",
      "app",
      "--template",
      "duckdb",
      "--assistant",
      "claude",
      "--yes",
    ]);
    expect(code, output).toBe(0);
    expect(output).toMatch(
      /^Created app from the template duckdb \(12 files\)\.\nAGENTS.md: written\nCLAUDE.md: written\n\n/,
    );
    const after = listed(join(folder, "app")).filter((path) => !path.startsWith("build/"));
    expect(after.sort()).toEqual([...before, "AGENTS.md", "CLAUDE.md"].sort());
  });

  it("asks last when there is a terminal, and writes nothing for none", () => {
    const folder = temp();
    const { code, asked } = ingestron(folder, ["init", "app", "--template", "duckdb"], [""]);
    expect(code).toBe(0);
    expect(asked).toEqual([
      "AI assistant files (copilot, claude, codex, cursor, agents or none) [none]: ",
    ]);
    expect(existsSync(join(folder, "app/AGENTS.md"))).toBe(false);
  });

  it("asks again after a wrong answer, with the mistake", () => {
    const folder = temp();
    const { code, asked, output } = ingestron(
      folder,
      ["init", "app", "--template", "duckdb"],
      ["gpt", "claude"],
    );
    expect(code, output).toBe(0);
    expect(asked).toEqual([
      "AI assistant files (copilot, claude, codex, cursor, agents or none) [none]: ",
      'Unknown assistant "gpt". Choose from copilot, claude, codex, cursor, agents or none.\nAI assistant files (copilot, claude, codex, cursor, agents or none) [none]: ',
    ]);
    expect(existsSync(join(folder, "app/CLAUDE.md"))).toBe(true);
    expect(output).toContain("CLAUDE.md: written\n");
  });

  it("does not ask with --yes, or with --assistant, or without a terminal", () => {
    for (const extra of [["--yes"], ["--assistant", "none"]]) {
      const { asked, code } = ingestron(
        temp(),
        ["init", "app", "--template", "duckdb", ...extra],
        ["claude"],
      );
      expect(code).toBe(0);
      expect(asked).toEqual([]);
    }
    const { code, output } = ingestron(temp(), ["init", "app", "--template", "duckdb"]);
    expect(code, output).toBe(0);
  });
});
