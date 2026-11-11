// `ingestron standard install` and `standard list` (spec/cli/kits.md, "Commands"). The
// catalogue is a file:// repository made in the test, or one that is not there: no network.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { catalogue, committed, ingestron, kits, offlineCatalogue, temp } from "./kit-catalogue.js";

offlineCatalogue();

const duckdb = kits.find((kit) => kit.id === "duckdb/local-medallion")!;

/** A project made from the kit, in its own folder; returns the project's folder. */
function kitProject(spec = "duckdb/local-medallion@2026-11-10"): string {
  const cwd = temp();
  const made = ingestron(cwd, "init", "p", "--kit", spec);
  expect(made.code, made.output).toBe(0);
  return join(cwd, "p");
}

const read = (folder: string, path: string) => readFileSync(join(folder, path), "utf8");
const edit = (folder: string, path: string, change: (text: string) => string) =>
  writeFileSync(join(folder, path), change(read(folder, path)));
const status = (folder: string) =>
  execFileSync("git", ["status", "--porcelain"], { cwd: folder, encoding: "utf8" });

/** Two versions of a kit `duckdb/shop` in the catalogue, the second with `later`'s changes. */
function twoVersions(later: Record<string, (text: string) => string>): void {
  process.env.INGESTRON_STANDARDS_REPOSITORY = catalogue([
    { id: "duckdb/shop", version: "2026-10-01" },
    {
      id: "duckdb/shop",
      version: "2026-10-20",
      change: (text) =>
        text.replace("notes: First version.", "notes: Bronze now keeps the source file's name."),
      files: later,
    },
  ]);
}

describe("standard install", () => {
  it("keeps the path and id", () => {
    const project = kitProject();
    mkdirSync(join(project, "standards"));
    renameSync(join(project, "standard.yaml"), join(project, "standards/acme.yaml"));
    edit(
      project,
      "standards/acme.yaml",
      (text) => `${text.replace("id: defaults", "id: acme")}# our own note\n`,
    );
    edit(project, "project.yaml", (text) =>
      text.replace("  - standard.yaml", "  - standards/*.yaml"),
    );
    committed(project);
    const { code, output } = ingestron(
      project,
      "standard",
      "install",
      "duckdb/local-medallion@2026-11-10",
    );
    expect(code, output).toBe(0);
    expect(output).toMatch(
      /^Replaced standards\/acme\.yaml with duckdb\/local-medallion@2026-11-10 \(was 2026-11-10\)\.\n/,
    );
    const kitText = readFileSync(join(duckdb.folder, "standard.yaml"), "utf8");
    expect(read(project, "standards/acme.yaml")).toBe(kitText.replace("id: defaults", "id: acme"));
    expect(existsSync(join(project, "standard.yaml"))).toBe(false);
    expect(status(project)).toBe(" M standards/acme.yaml\n");
  });

  it("refuses with an uncommitted change", () => {
    const project = kitProject();
    committed(project);
    edit(project, "standard.yaml", (text) => `${text}# not committed\n`);
    const { code, output } = ingestron(
      project,
      "standard",
      "install",
      "duckdb/local-medallion@2026-11-10",
    );
    expect(code).toBe(1);
    expect(output).toBe(
      "standard.yaml has changes that are not committed; commit them first so git diff shows only the new standard.\n",
    );
    expect(read(project, "standard.yaml")).toContain("# not committed");
  });

  it("goes on outside a git repository, and says it could not check", () => {
    const project = kitProject();
    edit(project, "standard.yaml", (text) => `${text}# ours\n`);
    const { code, output } = ingestron(
      project,
      "standard",
      "install",
      "duckdb/local-medallion@2026-11-10",
    );
    expect(code, output).toBe(0);
    expect(output).toMatch(
      /^Could not ask git whether standard\.yaml has changes, so it is replaced without that check\.\n\nReplaced standard\.yaml /,
    );
    expect(read(project, "standard.yaml")).not.toContain("# ours");
  });

  it("prints the notes and the kit files that changed between the two versions", () => {
    twoVersions({
      "platform.yaml": (text) => `${text}# Published as Parquet.\n`,
      "README.md": (text) => `${text}\nBronze keeps the source file's name.\n`,
      "standard.yaml": (text) =>
        text.replace("audit: [loaded_at]", "audit: [loaded_at, source_file]"),
    });
    const project = kitProject("duckdb/shop@2026-10-01");
    committed(project);
    const { code, output } = ingestron(project, "standard", "install", "duckdb/shop@2026-10-20");
    expect(code, output).toBe(0);
    expect(output).toBe(
      [
        "Replaced standard.yaml with duckdb/shop@2026-10-20 (was 2026-10-01).",
        "",
        "Bronze now keeps the source file's name.",
        "",
        "Not applied: the kit's other files that changed since 2026-10-01; compare them with yours:",
        "  STANDARD.md",
        "  platform.yaml",
        "",
        "Next: run ingestron plan, then review git diff.",
        "",
      ].join("\n"),
    );
    expect(read(project, "standard.yaml")).toContain("audit: [loaded_at, source_file]");
    expect(status(project)).toBe(" M standard.yaml\n");
  });

  it("says when the earlier version is not available", () => {
    const project = kitProject();
    edit(project, "standard.yaml", (text) =>
      text.replace("version: 2026-11-10", "version: 2025-01-01"),
    );
    committed(project);
    const { code, output } = ingestron(
      project,
      "standard",
      "install",
      "duckdb/local-medallion@2026-11-10",
    );
    expect(code, output).toBe(0);
    expect(output).toContain("(was 2025-01-01).\n");
    expect(output).toContain(
      "\nNot applied: the earlier version is not available, so the kit's other files cannot be compared.\n",
    );
  });

  it("prints the problems of the new standard as plan does, and keeps it", () => {
    twoVersions({
      "standard.yaml": (text) => text.replace("default: full", "default: sometimes"),
    });
    const project = kitProject("duckdb/shop@2026-10-01");
    committed(project);
    const { code, output } = ingestron(project, "standard", "install", "duckdb/shop@2026-10-20");
    expect(code, output).toBe(0);
    expect(output).toContain("the definitions have problems");
    expect(output).toMatch(/\n\nNext: run ingestron plan, then review git diff\.\n$/);
    expect(read(project, "standard.yaml")).toContain("default: sometimes");
  });

  it("finds the standard through an import written ./standard.yaml", () => {
    const project = kitProject();
    edit(project, "project.yaml", (text) =>
      text.replace("  - standard.yaml", "  - ./standard.yaml"),
    );
    committed(project);
    const { code, output } = ingestron(
      project,
      "standard",
      "install",
      "duckdb/local-medallion@2026-11-10",
    );
    expect(code, output).toBe(0);
    expect(output).not.toContain("no Standard document");
  });

  it("refuses a project with no Standard document, or with two", () => {
    const none = kitProject();
    edit(none, "project.yaml", (text) => text.replace("  - standard.yaml\n", ""));
    const first = ingestron(none, "standard", "install", "duckdb/local-medallion");
    expect(first.code).toBe(1);
    expect(first.output).toBe(
      "The project has no Standard document to replace. Add one to project.yaml's imports, or start a project with ingestron init --kit <kit>.\n",
    );
    const two = kitProject();
    writeFileSync(
      join(two, "other.yaml"),
      read(two, "standard.yaml").replace("id: defaults", "id: other"),
    );
    edit(two, "project.yaml", (text) =>
      text.replace("  - standard.yaml\n", "  - standard.yaml\n  - other.yaml\n"),
    );
    const second = ingestron(two, "standard", "install", "duckdb/local-medallion");
    expect(second.code).toBe(1);
    expect(second.output).toBe(
      "The project has 2 Standard documents (other.yaml, standard.yaml); keep one, then run this again.\n",
    );
  });
});
