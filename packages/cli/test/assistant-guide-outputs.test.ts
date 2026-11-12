// A current guide in the project changes nothing that the output folder cases show
// (spec/cli/assistants.md, section 6).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { nodeFiles } from "@ingestron/config";
import { guideFacts, guideSection } from "@ingestron/core/internal";
import { runWithStandIns, temp, withEnvironment } from "./assistant-helpers.js";
import { standIns, type Notice } from "./outputs-packs.js";

/** One output folder case: its files, command and what it needs of the host. */
interface OutputsCase {
  files: Record<string, string>;
  envvars?: Record<string, string>;
  notices?: Notice[];
  command: "plan" | "apply" | "check";
  args?: string[];
}

describe("a current guide changes nothing the output folder cases show", () => {
  const cases = join(import.meta.dirname, "../../../spec/cli/conformance/outputs");
  const names = readdirSync(cases).filter((name) => name.endsWith(".yaml"));

  /** Runs the case in a new folder, with a current AGENTS.md added when asked. */
  function runCase(testCase: OutputsCase, withGuide: boolean) {
    const folder = temp();
    for (const [path, text] of Object.entries(testCase.files)) {
      mkdirSync(join(folder, path, ".."), { recursive: true });
      writeFileSync(join(folder, path), text);
    }
    if (withGuide) {
      const facts = guideFacts(nodeFiles(folder), "build", standIns(testCase.notices));
      if ("noGuide" in facts) return undefined;
      writeFileSync(join(folder, "AGENTS.md"), guideSection(facts));
    }
    const args = [
      testCase.command,
      ...(testCase.args ?? []),
      "--definitions",
      ".",
      "--out",
      "build",
    ];
    return withEnvironment(testCase.envvars, () => runWithStandIns(args, folder, testCase.notices));
  }

  it("has the cases", () => expect(names.length).toBeGreaterThanOrEqual(14));
  for (const name of names) {
    it(name, () => {
      const testCase = parse(readFileSync(join(cases, name), "utf8")) as OutputsCase;
      const added = runCase(testCase, true);
      if (added !== undefined) expect(added).toEqual(runCase(testCase, false));
    });
  }
});
