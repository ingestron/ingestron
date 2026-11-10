// `ingestron init --kit <id>` alone: the newest version that is not a preview, among the installed
// kits and the catalogue's tags (spec/cli/kits.md, "Where kits are found"). The catalogue is a
// file:// repository made in the test, or one that is not there: no network.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { catalogue, ingestron, leftBehind, offlineCatalogue, temp } from "./kit-catalogue.js";

offlineCatalogue();

describe("init --kit <id> alone, with the catalogue", () => {
  it("takes a newer version from the catalogue's tags over the installed one", () => {
    process.env.INGESTRON_STANDARDS_REPOSITORY = catalogue([
      { id: "duckdb/local-medallion", version: "2026-12-01" },
    ]);
    const cwd = temp();
    let result = { code: -1, output: "" };
    const left = leftBehind(() => {
      result = ingestron(cwd, "init", "x", "--kit", "duckdb/local-medallion");
    });
    expect(result.code, result.output).toBe(0);
    expect(result.output).toMatch(/^Created x from the kit duckdb\/local-medallion@2026-12-01 /);
    expect(readFileSync(join(cwd, "x/standard.yaml"), "utf8")).toContain("version: 2026-12-01");
    expect(left).toEqual([]);
  });

  it("takes the installed version when the catalogue has only older ones, and says nothing more", () => {
    process.env.INGESTRON_STANDARDS_REPOSITORY = catalogue([
      { id: "duckdb/local-medallion", version: "2026-10-01" },
      { id: "duckdb/local-medallion", version: "2026-12-01-preview" },
    ]);
    const { code, output } = ingestron(temp(), "init", "x", "--kit", "duckdb/local-medallion");
    expect(code, output).toBe(0);
    expect(output).toMatch(/^Created x from the kit duckdb\/local-medallion@2026-11-10 /);
  });

  it("takes the newest installed version when the catalogue cannot be reached, and says so first", () => {
    const { code, output } = ingestron(temp(), "init", "x", "--kit", "duckdb/local-medallion");
    expect(code, output).toBe(0);
    expect(output).toMatch(
      /^Could not reach the catalogue; using the newest installed version, duckdb\/local-medallion@2026-11-10\.\nCreated x from the kit duckdb\/local-medallion@2026-11-10 /,
    );
  });
});
