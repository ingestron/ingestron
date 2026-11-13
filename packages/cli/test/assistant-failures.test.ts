// What the guide does when something inside it fails (spec/cli/assistants.md, sections 5 and 6):
// a line is printed as soon as its file is done, and `plan` and `apply` hide only the failures of
// the file system, never a programming error.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as core from "@ingestron/core/internal";

/** What the stand-ins for the guide's functions do on the next call. */
const behave = vi.hoisted(() => ({
  pointerUpdate: undefined as Error | undefined,
  guideFacts: undefined as Error | undefined,
}));

vi.mock("@ingestron/core/internal", async (importOriginal) => {
  const actual = await importOriginal<typeof core>();
  return {
    ...actual,
    pointerUpdate: (...args: Parameters<typeof actual.pointerUpdate>) => {
      if (behave.pointerUpdate) throw behave.pointerUpdate;
      return actual.pointerUpdate(...args);
    },
    guideFacts: (...args: Parameters<typeof actual.guideFacts>) => {
      if (behave.guideFacts) throw behave.guideFacts;
      return actual.guideFacts(...args);
    },
  };
});

const { writeAssistantFiles } = await import("../src/commands/assistant.js");
const { ingestron, project, read } = await import("./assistant-helpers.js");

beforeEach(() => {
  behave.pointerUpdate = undefined;
  behave.guideFacts = undefined;
});

describe("assistant files, one line each", () => {
  it("prints a file's line before the next file is looked at, so a later failure hides none", () => {
    const folder = project();
    behave.pointerUpdate = new TypeError("a mistake in the guide");
    let output = "";
    const io = { cwd: folder, write: (text: string) => (output += text), now: () => new Date() };
    expect(() => writeAssistantFiles(folder, ["claude"], "build", io)).toThrow(
      "a mistake in the guide",
    );
    expect(output).toBe("AGENTS.md: written\n");
    expect(read(folder, "AGENTS.md")).toContain("ingestron:begin guide");
  });
});

describe("plan and apply when the guide fails", () => {
  /** A project with a stale guide, so that plan and apply read its facts. */
  function staleProject(): string {
    const folder = project();
    expect(ingestron(folder, ["assistant", "add", "agents"]).code).toBe(0);
    writeFileSync(
      join(folder, "project.yaml"),
      "id: local\nenvironments: { dev: {}, prod: {} }\nimports: ['*.yaml']\n",
    );
    return folder;
  }

  it.each(["plan", "apply"])("%s says nothing for a failure that has a code", (command) => {
    const folder = staleProject();
    behave.guideFacts = Object.assign(new Error("no access"), { code: "EACCES" });
    const { code, output } = ingestron(folder, [command]);
    expect(code).toBe(0);
    expect(output).not.toContain("AGENTS.md");
  });

  it.each(["plan", "apply"])("%s lets a programming error through", (command) => {
    const folder = staleProject();
    behave.guideFacts = new TypeError("a mistake in the guide");
    expect(() => ingestron(folder, [command])).toThrow("a mistake in the guide");
  });
});
