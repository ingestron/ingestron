// A file that cannot be read or written (spec/cli/assistants.md, section 5): its line, the next
// file still written, exit 1 for assistant add, and nothing thrown.
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeAssistantFiles } from "../src/commands/assistant.js";
import { ingestron, listed, project, read } from "./assistant-helpers.js";

// chmod does not deny the superuser, so these cannot show anything as root.
const denied = process.getuid?.() === 0 ? it.skip : it;

describe("a file that cannot be read or written", () => {
  const restore: string[] = [];
  /** A path whose mode is put back after the test, so the temporary folder can be removed. */
  const mode = (path: string, bits: number) => {
    chmodSync(path, bits);
    restore.push(path);
  };
  afterEach(() => {
    for (const path of restore.splice(0))
      chmodSync(path, path.endsWith("AGENTS.md") ? 0o644 : 0o755);
  });

  denied("says an AGENTS.md with mode 000 could not be read, and writes the other files", () => {
    const folder = project({ "AGENTS.md": "# Mine\n" });
    mode(join(folder, "AGENTS.md"), 0o000);
    const { code, output } = ingestron(folder, ["assistant", "add", "claude"]);
    expect(output).toBe(
      "AGENTS.md: could not be read (EACCES), so nothing was written to it.\nCLAUDE.md: written\n",
    );
    expect(code).toBe(1);
    expect(read(folder, "CLAUDE.md")).toContain("@AGENTS.md");
  });

  denied("says an AGENTS.md with mode 444 could not be written, and leaves it as it is", () => {
    const folder = project({ "AGENTS.md": "# Mine\n" });
    mode(join(folder, "AGENTS.md"), 0o444);
    const { code, output } = ingestron(folder, ["assistant", "add", "claude"]);
    expect(output).toBe("AGENTS.md: could not be written (EACCES).\nCLAUDE.md: written\n");
    expect(code).toBe(1);
    expect(read(folder, "AGENTS.md")).toBe("# Mine\n");
    expect(listed(folder).filter((path) => path.includes(".tmp"))).toEqual([]);
  });

  denied("says a folder with mode 555 could not be written, for each file", () => {
    const folder = project();
    mode(folder, 0o555);
    const { code, output } = ingestron(folder, ["assistant", "add", "claude"]);
    expect(output).toBe(
      "AGENTS.md: could not be written (EACCES).\nCLAUDE.md: could not be written (EACCES).\n",
    );
    expect(code).toBe(1);
    expect(listed(folder).sort()).toEqual(["project.yaml", "standard.yaml"]);
  });

  denied("leaves an existing AGENTS.md as it is in a folder with mode 555", () => {
    const folder = project({ "AGENTS.md": "# Mine\n" });
    mode(folder, 0o555);
    const { code, output } = ingestron(folder, ["assistant", "add", "agents"]);
    expect(output).toBe("AGENTS.md: could not be written (EACCES).\n");
    expect(code).toBe(1);
    expect(readFileSync(join(folder, "AGENTS.md"), "utf8")).toBe("# Mine\n");
  });

  denied("does not throw out of writeAssistantFiles, which init calls and does not heed", () => {
    const folder = project({ "AGENTS.md": "# Mine\n" });
    mode(join(folder, "AGENTS.md"), 0o000);
    let output = "";
    const io = { cwd: folder, write: (text: string) => (output += text), now: () => new Date() };
    expect(writeAssistantFiles(folder, ["agents"], "build", io)).toBe(false);
    expect(output).toBe("AGENTS.md: could not be read (EACCES), so nothing was written to it.\n");
  });

  it("is still current and exit 0 when nothing has to be written", () => {
    const folder = project();
    ingestron(folder, ["assistant", "add", "agents"]);
    writeFileSync(join(folder, "CLAUDE.md"), "@AGENTS.md\n");
    expect(ingestron(folder, ["assistant", "add", "agents"]).code).toBe(0);
  });
});
