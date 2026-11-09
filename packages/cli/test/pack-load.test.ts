// A pack that cannot be loaded (spec/cli/outputs.md, section 4): every command prints the
// PACK_LOAD error alone, writes nothing and exits with 2.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { packs } from "@ingestron/core";
import { workspace } from "./workspace.js";

const count = packs.length;
const refused = [
  "(project)  error  PACK_LOAD",
  '  The pack "broken" lists the platform field "schedule.nowhere", which the Platform document does not have.',
  "  This is a mistake in the pack, not in the project, so nothing is checked or generated. Install a version of Ingestron, or of the editor extension, that fixes it.",
  "",
].join("\n");

afterEach(() => {
  packs.splice(count);
});

describe("a pack that cannot be loaded", () => {
  const commands = [
    ["plan"],
    ["apply"],
    ["check"],
    ["request", "--env", "dev"],
    ["compare", "--env", "dev", "--env", "prod"],
    ["schemas"],
    ["init", "shop", "--template", "retail", "--yes"],
  ];
  for (const command of commands)
    it(`stops ${command[0]} with PACK_LOAD and exit 2, writing nothing`, () => {
      const { folder, ingestron } = workspace();
      const before = readdirSync(folder).sort();
      packs.push({ ...packs[0]!, id: "broken", platformFields: ["schedule.nowhere"] });
      const { code, output } = ingestron(...command);
      expect(code).toBe(2);
      expect(output).toBe(refused);
      expect(output).not.toMatch(/^ {4}at /m);
      expect(readdirSync(folder).sort()).toEqual(before);
      expect(existsSync(join(folder, "build"))).toBe(false);
    });

  it("still answers --help and a usage mistake first", () => {
    const { ingestron } = workspace();
    packs.push({ ...packs[0]!, id: "broken", platformFields: ["schedule.nowhere"] });
    expect(ingestron("--help").code).toBe(0);
    expect(ingestron("plan", "--env", "dev").code).toBe(2);
    expect(ingestron("plan", "--env", "dev").output).not.toContain("PACK_LOAD");
  });
});
