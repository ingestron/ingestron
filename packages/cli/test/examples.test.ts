// Every starter and test fixture generates, and generating again changes
// nothing. The output is not committed; it is written to a temporary folder.
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/index.js";

const examples = join(import.meta.dirname, "..");
const names = ["project-templates", "test/fixtures"]
  .flatMap((kind) =>
    readdirSync(join(examples, kind), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${kind}/${entry.name}`),
  )
  .sort();

describe("samples", () => {
  it("has the eight starters and five fixtures", () => {
    expect(names).toHaveLength(13);
  });

  for (const name of names) {
    it(`${name}: generates, and is up to date when generated again`, () => {
      let output = "";
      const folder = join(examples, name);
      const out = mkdtempSync(join(tmpdir(), "ingestron-sample-"));
      const io = { cwd: folder, write: (text: string) => (output += text) };
      const apply = run(["apply", "--no-diff", "--definitions", folder, "--out", out], io);
      expect(apply, output).toBe(0);
      output = "";
      expect(run(["check", "--definitions", folder, "--out", out], io), output).toBe(0);
    });
  }
});
