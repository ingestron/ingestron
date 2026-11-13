// ingestron source import (spec/cli/sources.md, section 6), run on a copy of the request
// conformance project with an export of the erp catalog saved in it.
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/index.js";
import { fixture, imports, now, read, sourceProject, withCatalog } from "./source-projects.js";

describe("ingestron source import", () => {
  it("writes the document and adds it to the imports of project.yaml", () => {
    const { folder, ingestron } = withCatalog();
    const before = read(folder, "project.yaml");
    const { code, output } = ingestron(
      "source",
      "import",
      "erp",
      "sources/erp.catalog.csv",
      "--env",
      "dev",
    );
    expect(code).toBe(0);
    expect(read(folder, "sources/erp.yaml")).toBe(imports("erp.first.yaml"));
    expect(read(folder, "project.yaml")).toBe(`${before.trimEnd()}\n  - sources/erp.yaml\n`);
    expect(output).toBe(
      [
        "sources/erp.yaml: 3 added, 0 changed, 0 removed.",
        "Compatible:",
        "  ERP.dbo.Customers: added",
        "  ERP.dbo.Legacy: added",
        "  ERP.dbo.Shops: added",
        'Type "geography" of ERP.dbo.Shops.Location is not known; read as string.',
        "Wrote sources/erp.yaml.",
        "Added sources/erp.yaml to the imports of project.yaml.",
        "",
      ].join("\n"),
    );
  });

  it("works without --env on a project whose values are per environment, recording none", () => {
    const { folder, ingestron } = withCatalog();
    const { code } = ingestron("source", "import", "erp", "sources/erp.catalog.csv");
    expect(code).toBe(0);
    const document = read(folder, "sources/erp.yaml");
    expect(document).not.toContain("environment:");
    expect(document).toBe(imports("erp.first.yaml").replace("environment: dev\n", ""));
  });

  it("does not add the import again, and reports no changes for the same file", () => {
    const { folder, ingestron } = withCatalog();
    ingestron("source", "import", "erp", "sources/erp.catalog.csv", "--env", "dev");
    const project = read(folder, "project.yaml");
    const { code, output } = ingestron(
      "source",
      "import",
      "erp",
      "sources/erp.catalog.csv",
      "--env",
      "dev",
    );
    expect(code).toBe(0);
    expect(output).toBe(
      'sources/erp.yaml: no changes.\nType "geography" of ERP.dbo.Shops.Location is not known; read as string.\nWrote sources/erp.yaml.\n',
    );
    expect(read(folder, "project.yaml")).toBe(project);
  });

  it("with --dry-run writes nothing and prints the same changes", () => {
    const real = withCatalog();
    const wet = real.ingestron(
      "source",
      "import",
      "erp",
      "sources/erp.catalog.csv",
      "--env",
      "dev",
    );
    const { folder, ingestron } = withCatalog();
    const before = read(folder, "project.yaml");
    const { code, output } = ingestron(
      "source",
      "import",
      "erp",
      "sources/erp.catalog.csv",
      "--env",
      "dev",
      "--dry-run",
    );
    expect(code).toBe(0);
    expect(existsSync(join(folder, "sources/erp.yaml"))).toBe(false);
    expect(read(folder, "project.yaml")).toBe(before);
    const changes = wet.output.split("Wrote ")[0];
    expect(output).toBe(`${changes}Nothing was written (--dry-run).\n`);
  });

  it("names the table of a sample with --object", () => {
    const { folder, ingestron } = sourceProject("request");
    mkdirSync(join(folder, "elsewhere"));
    cpSync(join(fixture("imports"), "shipments.csv"), join(folder, "elsewhere/shipments.csv"));
    const { code, output } = ingestron(
      "source",
      "import",
      "erp",
      "./elsewhere/shipments.csv",
      "--object",
      "ERP.dbo.Shipments",
      "--env",
      "dev",
    );
    expect(code).toBe(0);
    expect(output).toContain("  ERP.dbo.Shipments: added\n");
    expect(read(folder, "sources/erp.yaml")).toContain("file: elsewhere/shipments.csv");
  });

  it("refuses a metadata document that is a link, writing neither file", () => {
    const { folder, ingestron } = withCatalog();
    const outside = join(mkdtempSync(join(tmpdir(), "ingestron-outside-")), "erp.yaml");
    writeFileSync(outside, "theirs\n");
    symlinkSync(outside, join(folder, "sources/erp.yaml"));
    const before = read(folder, "project.yaml");
    const { code, output } = ingestron("source", "import", "erp", "sources/erp.catalog.csv");
    expect(code).toBe(1);
    expect(output).toContain("sources/erp.yaml is not a regular file");
    expect(output).toContain("Nothing was written.");
    expect(readFileSync(outside, "utf8")).toBe("theirs\n");
    expect(read(folder, "project.yaml")).toBe(before);
  });

  it("copies no value from a sample's rows into the printed text or any file written", () => {
    const { folder, ingestron } = sourceProject("request");
    mkdirSync(join(folder, "sources/erp"));
    cpSync(
      join(fixture("imports"), "shipments.csv"),
      join(folder, "sources/erp/ERP.dbo.Shipments.csv"),
    );
    const { code, output } = ingestron(
      "source",
      "import",
      "erp",
      "sources/erp/ERP.dbo.Shipments.csv",
    );
    expect(code).toBe(0);
    const written = ["sources/erp.yaml", "project.yaml"].map((file) => read(folder, file));
    expect(written[0]).toContain("ERP.dbo.Shipments");
    const folderText = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? folderText(join(dir, entry.name))
          : entry.name === "ERP.dbo.Shipments.csv"
            ? []
            : [readFileSync(join(dir, entry.name), "utf8")],
      );
    for (const value of ["ZZ-SECRET-42", "ORD-0002", "Swift Freight", "Blue Haulage"])
      for (const text of [output, ...written, ...folderText(folder)])
        expect(text).not.toContain(value);
    // The import leaves no temporary file in the folders it wrote to.
    for (const dir of [folder, join(folder, "sources")])
      expect(readdirSync(dir).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("takes the file relative to the current folder and records its path in the project", () => {
    const { folder } = withCatalog();
    const name = basename(folder);
    let output = "";
    const code = run(
      [
        "source",
        "import",
        "erp",
        `${name}/sources/erp.catalog.csv`,
        "--definitions",
        name,
        "--env",
        "dev",
      ],
      { cwd: dirname(folder), write: (text) => (output += text), now: () => now },
    );
    expect(code).toBe(0);
    expect(read(folder, "sources/erp.yaml")).toBe(imports("erp.first.yaml"));
  });

  it("records only the name of a file from outside the project", () => {
    const { folder, ingestron } = sourceProject("request");
    const outside = mkdtempSync(join(tmpdir(), "ingestron-outside-"));
    cpSync(join(fixture("imports"), "first.catalog.csv"), join(outside, "export.csv"));
    const { code } = ingestron(
      "source",
      "import",
      "erp",
      join(outside, "export.csv"),
      "--env",
      "dev",
    );
    expect(code).toBe(0);
    expect(read(folder, "sources/erp.yaml")).toContain("file: export.csv");
  });
});
