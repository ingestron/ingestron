// `ingestron standard install` when building the project with the new standard stops on an error
// (spec/cli/kits.md, "standard install <spec>"): the file is written, so it says so in one line
// and exits 0.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type * as Core from "@ingestron/core";
import { committed, ingestron, offlineCatalogue, temp } from "./kit-catalogue.js";

vi.mock("@ingestron/core", async (original) => ({
  ...(await original<typeof Core>()),
  generateAll: () => {
    throw new Error("The pack could not be read");
  },
}));

offlineCatalogue();

describe("standard install when the project cannot be built", () => {
  it("keeps the new standard, says why its problems are not listed, and exits 0", () => {
    const cwd = temp();
    const made = ingestron(cwd, "init", "p", "--kit", "duckdb/local-medallion@2026-11-10");
    expect(made.code, made.output).toBe(0);
    const project = join(cwd, "p");
    committed(project);
    const { code, output } = ingestron(
      project,
      "standard",
      "install",
      "duckdb/local-medallion@2026-11-10",
    );
    expect(code, output).toBe(0);
    expect(output).toBe(
      [
        "Replaced standard.yaml with duckdb/local-medallion@2026-11-10 (was 2026-11-10).",
        "",
        "First version.",
        "",
        "Not applied: no other kit file changed since 2026-11-10.",
        "",
        "Could not list the project's problems with the new standard: The pack could not be read. Run ingestron plan to see them.",
        "",
        "Next: run ingestron plan, then review git diff.",
        "",
      ].join("\n"),
    );
    expect(readFileSync(join(project, "standard.yaml"), "utf8")).toContain("version: 2026-11-10");
  });
});
