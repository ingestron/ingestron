// The safe rewrite of an existing file (spec/cli/assistants.md, section 5): a temporary file in the
// same folder, renamed over the target. A failed write leaves the original and no temporary file.
import {
  chmodSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as nodeFs from "node:fs";

/** What the stand-ins for node:fs do on the next call. */
const behave = vi.hoisted(() => ({
  failWrite: undefined as Error | undefined,
  afterWrite: undefined as (() => void) | undefined,
  renamed: [] as [string, string][],
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof nodeFs>();
  return {
    ...actual,
    writeFileSync: (...args: Parameters<typeof actual.writeFileSync>) => {
      if (behave.failWrite) throw behave.failWrite;
      actual.writeFileSync(...args);
      behave.afterWrite?.();
    },
    renameSync: (from: string, to: string) => {
      behave.renamed.push([from, to]);
      actual.renameSync(from, to);
    },
  };
});

const { writeSafely } = await import("../src/commands/assistant-write.js");
const { ingestron, project, read, temp } = await import("./assistant-helpers.js");

beforeEach(() => {
  behave.failWrite = undefined;
  behave.afterWrite = undefined;
  behave.renamed = [];
});

const hidden = (folder: string) => readdirSync(folder).filter((name) => name.endsWith(".tmp"));

describe("writeSafely on an existing file", () => {
  it("writes a temporary file in the same folder and renames it over the target", () => {
    const folder = temp();
    const file = join(folder, "AGENTS.md");
    writeFileSync(file, "one\n");
    expect(writeSafely(file, "two\n", true)).toBe(true);
    expect(read(folder, "AGENTS.md")).toBe("two\n");
    expect(behave.renamed).toHaveLength(1);
    const [from, to] = behave.renamed[0]!;
    expect(to).toBe(file);
    expect(from).toMatch(/\/\.AGENTS\.md\.[0-9a-f]{12}\.tmp$/);
    expect(hidden(folder)).toEqual([]);
  });

  it("gives the new file the mode of the original", () => {
    const folder = temp();
    const file = join(folder, "AGENTS.md");
    writeFileSync(file, "one\n");
    chmodSync(file, 0o640);
    expect(writeSafely(file, "two\n", true)).toBe(true);
    expect(statSync(file).mode & 0o777).toBe(0o640);
  });

  it("leaves the original bytes and no temporary file when the write fails", () => {
    const folder = temp();
    const file = join(folder, "AGENTS.md");
    writeFileSync(file, "original\n");
    behave.failWrite = Object.assign(new Error("disk full"), { code: "ENOSPC" });
    expect(() => writeSafely(file, "new text\n", true)).toThrow("disk full");
    expect(read(folder, "AGENTS.md")).toBe("original\n");
    expect(hidden(folder)).toEqual([]);
    expect(readdirSync(folder)).toEqual(["AGENTS.md"]);
  });

  it("is not renamed over a link put there after the write, and the temporary file is removed", () => {
    const folder = temp();
    const file = join(folder, "AGENTS.md");
    const elsewhere = join(temp(), "elsewhere.md");
    writeFileSync(file, "original\n");
    writeFileSync(elsewhere, "theirs\n");
    behave.afterWrite = () => {
      rmSync(file);
      symlinkSync(elsewhere, file);
    };
    expect(writeSafely(file, "new text\n", true)).toBe(false);
    expect(readFileSync(elsewhere, "utf8")).toBe("theirs\n");
    expect(hidden(folder)).toEqual([]);
    expect(behave.renamed).toEqual([]);
  });

  it("is not renamed over a folder put there after the write", () => {
    const folder = temp();
    const file = join(folder, "AGENTS.md");
    writeFileSync(file, "original\n");
    behave.afterWrite = () => {
      rmSync(file);
      mkdirSync(file);
    };
    expect(writeSafely(file, "new text\n", true)).toBe(false);
    expect(hidden(folder)).toEqual([]);
  });

  it("creates a new file directly, without a temporary file", () => {
    const folder = temp();
    expect(writeSafely(join(folder, "AGENTS.md"), "one\n", false)).toBe(true);
    expect(behave.renamed).toEqual([]);
    expect(read(folder, "AGENTS.md")).toBe("one\n");
  });
});

describe("assistant add when the write fails", () => {
  it("says it could not be written, with error when the failure has no code, and keeps the file", () => {
    const folder = project({ "AGENTS.md": "# Mine\n" });
    behave.failWrite = new Error("boom");
    const { code, output } = ingestron(folder, ["assistant", "add", "agents"]);
    expect(output).toBe("AGENTS.md: could not be written (error).\n");
    expect(code).toBe(1);
    expect(read(folder, "AGENTS.md")).toBe("# Mine\n");
    expect(hidden(folder)).toEqual([]);
  });

  it("says it with the error's code", () => {
    const folder = project({ "AGENTS.md": "# Mine\n" });
    behave.failWrite = Object.assign(new Error("full"), { code: "ENOSPC" });
    expect(ingestron(folder, ["assistant", "add", "agents"]).output).toBe(
      "AGENTS.md: could not be written (ENOSPC).\n",
    );
  });
});
