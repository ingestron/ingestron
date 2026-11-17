// The help for each problem with an output folder is checked against what generate reports.
import {
  applyPlan,
  memoryFolder,
  planGeneration,
  readManifest,
  type OutputFolder,
  type Problem,
} from "@ingestron/generate";
import { describe, expect, it } from "vitest";
import { problemHelp } from "../../src/index.js";

const apply = (folder: OutputFolder, wanted: Record<string, string> = {}) =>
  applyPlan(folder, planGeneration(folder, wanted)).problems;
const only = (problems: Problem[]) => {
  expect(problems).toHaveLength(1);
  return problems[0]!;
};

describe("problemHelp", () => {
  it("has every code, each with a meaning and fix that end a sentence", () => {
    expect(Object.keys(problemHelp).sort()).toEqual([
      "BAD_MANIFEST",
      "BAD_PATH",
      "CHANGED_SINCE_PLAN",
      "FIRST_WRITE",
      "LOCKED",
      "PLAN_HAS_CONFLICTS",
      "WRITE_FAILED",
    ]);
    for (const [code, help] of Object.entries(problemHelp)) {
      expect(help.meaning, code).toMatch(/\.$/);
      expect(help.fix, code).toMatch(/\.$/);
    }
  });

  it("names every reason a path is refused, as generate words it", () => {
    const wanted = {
      "/absolute.txt": "",
      "a:b.txt": "",
      "a/../b.txt": "",
      ".generated.json": "",
      ".git/config": "",
      "Same.txt": "",
      "same.txt": "",
    };
    const messages = planGeneration(memoryFolder(), wanted).problems.map((item) => item.message);
    const phrases: [RegExp, string][] = [
      [/not a relative path/, "not a relative path"],
      [/contains "\\", ":" or a NUL/, "contains `\\`, `:` or a NUL"],
      [/empty, "\." or "\.\." part/, "an empty, `.` or `..` part"],
      [/reserved for the manifest and lock/, "is the manifest or lock file"],
      [/inside a \.git folder/, "inside a `.git` folder"],
      [/only in letter case/, "only in letter case"],
    ];
    for (const [pattern, phrase] of phrases) {
      expect(
        messages.some((message) => pattern.test(message)),
        String(pattern),
      ).toBe(true);
      expect(problemHelp.BAD_PATH.meaning).toContain(phrase);
    }
  });

  it("gives the fix generate's own hints give, and the command that reports each code", () => {
    const manifest = only(
      [readManifest(memoryFolder({ ".generated.json": "x" }))].flatMap((r) =>
        "problem" in r ? [r.problem] : [],
      ),
    );
    expect(manifest.code).toBe("BAD_MANIFEST");
    expect(manifest.message).toContain(
      "Restore it from version control, or delete it to start again.",
    );
    expect(problemHelp.BAD_MANIFEST.fix).toBe(
      "Restore it from version control, or delete it to start again.",
    );

    const locked = memoryFolder();
    locked.lock();
    const lock = only(apply(locked));
    expect(lock.message).toContain("If none is, delete .generated.lock.");
    expect(problemHelp.LOCKED.fix).toContain("If none is running, delete `.generated.lock`.");

    const dirty = only(apply(memoryFolder(), { "/bad.txt": "" }));
    expect(dirty.code).toBe("PLAN_HAS_CONFLICTS");
    expect(dirty.message).toContain("plan again");
    expect(problemHelp.PLAN_HAS_CONFLICTS.fix).toContain("plan again");

    const folder = memoryFolder();
    const plan = planGeneration(folder, { "a.txt": "a" });
    folder.write("a.txt", "someone else's");
    const changed = only(applyPlan(folder, plan).problems);
    expect(changed.code).toBe("CHANGED_SINCE_PLAN");
    expect(changed.message).toContain("plan again.");
    expect(problemHelp.CHANGED_SINCE_PLAN.fix).toBe("Plan again.");

    const broken: OutputFolder = {
      ...memoryFolder(),
      write: () => {
        throw new Error("disk full");
      },
    };
    const failed = only(apply(broken, { "a.txt": "a" }));
    expect(failed.code).toBe("WRITE_FAILED");
    expect(failed.message).toContain("disk full");

    const byPlan = ["BAD_PATH", "BAD_MANIFEST", "FIRST_WRITE"];
    for (const [code, help] of Object.entries(problemHelp))
      expect(help.reportedBy, code).toBe(byPlan.includes(code) ? "plan" : "apply");
  });
});
