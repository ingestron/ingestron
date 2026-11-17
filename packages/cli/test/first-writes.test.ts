// plan and apply refuse an output whose pack refuses its first writes (spec/cli/outputs.md, section 4).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import type { Pack } from "@ingestron/definitions";
import { generate } from "../src/commands/generate.js";
import { readArgs } from "../src/terminal/index.js";
import { standIns } from "./outputs-packs.js";

const oneCase = join(import.meta.dirname, "../../../spec/cli/conformance/outputs/01-one-pack.yaml");

/** A folder holding the project of the one-pack case. */
function project(): string {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-first-writes-"));
  const { files } = parse(readFileSync(oneCase, "utf8")) as { files: Record<string, string> };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    writeFileSync(join(folder, path), text);
  }
  return folder;
}

/** The stand-in packs, with `fold` refusing any file its manifest does not list. */
function refusing(): Pack[] {
  return standIns().map((pack) =>
    pack.id === "fold"
      ? {
          ...pack,
          checkFirstWrites: (files, before) =>
            Object.keys(files)
              .filter((path) => !before.has(path))
              .map((path) => `${path} is new.`),
        }
      : pack,
  );
}

function run(command: string, cwd: string, packs: Pack[]): { exit: number; output: string } {
  const options = readArgs([command, "--definitions", ".", "--out", "build"]);
  if (options === "help" || "mistake" in options) throw new Error("usage");
  let output = "";
  const exit = generate(options, { cwd, write: (text) => (output += text) }, packs);
  return { exit, output };
}

describe("refused first writes", () => {
  it("plan shows each FIRST_WRITE and exits 1", () => {
    const { exit, output } = run("plan", project(), refusing());
    expect(exit).toBe(1);
    expect(output).toContain("fold → build/fold (dev, test, prod)");
    expect(output).toContain("problem   FIRST_WRITE\n          tables.txt is new.");
    expect(output).toContain("problem   FIRST_WRITE\n          targets.txt is new.");
    expect(output).toContain("Fix the problems before applying.");
  });

  it("apply writes nothing", () => {
    const folder = project();
    const { exit, output } = run("apply", folder, refusing());
    expect(exit).toBe(1);
    expect(output).toContain("FIRST_WRITE");
    expect(output).not.toContain("Applied.");
    expect(existsSync(join(folder, "build/fold/tables.txt"))).toBe(false);
    expect(existsSync(join(folder, "build/fold/.generated.json"))).toBe(false);
  });

  it("accepts the files once the manifest lists them", () => {
    const folder = project();
    expect(run("apply", folder, standIns()).exit).toBe(0);
    const { exit, output } = run("plan", folder, refusing());
    expect(output).not.toContain("FIRST_WRITE");
    expect(exit).toBe(0);
  });
});
