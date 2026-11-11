// `ingestron standard install` and the catalogue (spec/cli/kits.md, "standard install <spec>"):
// `<id>` alone takes a newer tagged version, and the old Standard's `origin` is used to compare
// only when it names a kit id. The catalogue is a file:// repository made in the test.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { catalogue, committed, ingestron, offlineCatalogue, temp } from "./kit-catalogue.js";

offlineCatalogue();

/** A project made from the installed DuckDB kit, in its own folder; returns the project's folder. */
function kitProject(): string {
  const cwd = temp();
  const made = ingestron(cwd, "init", "p", "--kit", "duckdb/local-medallion@2026-11-10");
  expect(made.code, made.output).toBe(0);
  return join(cwd, "p");
}

const read = (folder: string, path: string) => readFileSync(join(folder, path), "utf8");
const edit = (folder: string, path: string, change: (text: string) => string) =>
  writeFileSync(join(folder, path), change(read(folder, path)));

describe("standard install with the catalogue", () => {
  it("compares with the earlier version only when origin names a kit id, never cloning a URL", () => {
    // A catalogue the origin's URL could reach: were it cloned, the kits would compare.
    const url = catalogue([{ id: "duckdb/local-medallion", version: "2026-11-10" }]);
    const project = kitProject();
    edit(project, "standard.yaml", (text) =>
      text.replace(
        "standard: duckdb/local-medallion",
        `standard: "${url}#kits/duckdb/local-medallion/2026-11-10@duckdb/local-medallion"`,
      ),
    );
    committed(project);
    const { code, output } = ingestron(
      project,
      "standard",
      "install",
      "duckdb/local-medallion@2026-11-10",
    );
    expect(code, output).toBe(0);
    expect(output).toContain(
      "\nNot applied: the earlier version is not available, so the kit's other files cannot be compared.\n",
    );
  });

  it("<id> alone takes a newer version from the catalogue", () => {
    process.env.INGESTRON_STANDARDS_REPOSITORY = catalogue([
      { id: "duckdb/local-medallion", version: "2026-12-01" },
    ]);
    const project = kitProject();
    committed(project);
    const { code, output } = ingestron(project, "standard", "install", "duckdb/local-medallion");
    expect(code, output).toBe(0);
    expect(output).toMatch(
      /^Replaced standard\.yaml with duckdb\/local-medallion@2026-12-01 \(was 2026-11-10\)\.\n/,
    );
    expect(read(project, "standard.yaml")).toContain("version: 2026-12-01");
  });
});
