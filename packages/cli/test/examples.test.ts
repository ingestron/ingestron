// Every sample's committed build/ folder must be exactly what the definitions
// generate today. After an intended change, run `pnpm examples` and review the diff.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/index.js";

const examples = join(import.meta.dirname, "../../../samples");
const names = ["starters", "guides"]
  .flatMap((kind) =>
    readdirSync(join(examples, kind), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${kind}/${entry.name}`),
  )
  .sort();

describe("samples", () => {
  it("has the eighteen samples", () => {
    expect(names).toHaveLength(18);
  });

  for (const name of names) {
    it(`${name}: build/ is up to date`, () => {
      let output = "";
      const folder = join(examples, name);
      const code = run(["check", "--definitions", folder, "--out", join(folder, "build")], {
        cwd: folder,
        write: (text) => (output += text),
      });
      expect({ code, output }).toEqual({
        code: 0,
        output: expect.not.stringContaining("not up to date"),
      });
    });
  }
});
