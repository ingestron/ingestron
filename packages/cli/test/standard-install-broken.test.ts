// `ingestron standard install` on a project that does not build, and when the earlier version
// of the kit cannot be compared (spec/cli/kits.md, "standard install <spec>"). The standard is
// found without loading the project, and the command exits 0 once the file is written.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { catalogue, committed, ingestron, kits, offlineCatalogue, temp } from "./kit-catalogue.js";

offlineCatalogue();

const duckdb = kits.find((kit) => kit.id === "duckdb/local-medallion")!;
const kitStandard = readFileSync(join(duckdb.folder, "standard.yaml"), "utf8");

function kitProject(spec = "duckdb/local-medallion@2026-11-10"): string {
  const cwd = temp();
  const made = ingestron(cwd, "init", "p", "--kit", spec);
  expect(made.code, made.output).toBe(0);
  return join(cwd, "p");
}

const edit = (folder: string, path: string, change: (text: string) => string) =>
  writeFileSync(join(folder, path), change(readFileSync(join(folder, path), "utf8")));

describe("standard install on a project that does not build", () => {
  it("replaces a standard that fails its schema", () => {
    const project = kitProject();
    edit(project, "standard.yaml", (text) => `${text}colour: blue\n`);
    committed(project);
    expect(ingestron(project, "plan").code).toBe(1);
    const { code, output } = ingestron(
      project,
      "standard",
      "install",
      "duckdb/local-medallion@2026-11-10",
    );
    expect(code, output).toBe(0);
    expect(output).toMatch(/^Replaced standard\.yaml with duckdb\/local-medallion@2026-11-10 /);
    expect(output).not.toContain("the definitions have problems");
    expect(readFileSync(join(project, "standard.yaml"), "utf8")).toBe(kitStandard);
  });

  it("replaces it beside a half-edited flow, and prints the plan's problems", () => {
    const project = kitProject();
    edit(project, "standard.yaml", (text) => `${text}colour: blue\n`);
    edit(project, "flows/orders.yaml", (text) => `${text}half_written: true\n`);
    committed(project);
    const { code, output } = ingestron(
      project,
      "standard",
      "install",
      "duckdb/local-medallion@2026-11-10",
    );
    expect(code, output).toBe(0);
    expect(output).toContain("the definitions have problems");
    expect(output).toContain("flows/orders.yaml");
    expect(output).toMatch(/\n\nNext: run ingestron plan, then review git diff\.\n$/);
    expect(readFileSync(join(project, "standard.yaml"), "utf8")).toBe(kitStandard);
  });

  it("refuses an imported file that is not valid YAML, and writes nothing", () => {
    const project = kitProject();
    edit(project, "flows/orders.yaml", (text) => `${text}tables: [unclosed\n`);
    committed(project);
    const { code, output } = ingestron(
      project,
      "standard",
      "install",
      "duckdb/local-medallion@2026-11-10",
    );
    expect(code).toBe(1);
    expect(output).toMatch(
      /^flows\/orders\.yaml is not valid YAML, so the project's standard was not found: /,
    );
  });
});

describe("standard install when the earlier version cannot be compared", () => {
  it("says it is not available, and exits 0, when reading it fails after the write", () => {
    // The earlier version holds a symbolic link, so its files cannot be read as a kit's.
    process.env.INGESTRON_STANDARDS_REPOSITORY = catalogue([
      { id: "duckdb/shop", version: "2026-10-01", links: { "extra.md": "README.md" } },
      { id: "duckdb/shop", version: "2026-10-20" },
    ]);
    const project = kitProject("duckdb/shop@2026-10-20");
    edit(project, "standard.yaml", (text) =>
      text.replace("version: 2026-10-20", "version: 2026-10-01"),
    );
    committed(project);
    const { code, output } = ingestron(project, "standard", "install", "duckdb/shop@2026-10-20");
    expect(code, output).toBe(0);
    expect(output).toContain("(was 2026-10-01).\n");
    expect(output).toContain(
      "\nNot applied: the earlier version is not available, so the kit's other files cannot be compared.\n",
    );
    expect(readFileSync(join(project, "standard.yaml"), "utf8")).toContain("version: 2026-10-20");
  });
});
