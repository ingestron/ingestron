// ingestron source import refuses and stops (spec/cli/sources.md, section 6): each leaves
// every file as it was.
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { imports, read, sourceProject, withCatalog } from "./source-projects.js";

describe("ingestron source import stops", () => {
  it("refuses a file the readers refuse, printing each reason, and writes nothing", () => {
    const { folder, ingestron } = sourceProject("request");
    writeFileSync(join(folder, "sources/erp.catalog.csv"), "not,a,catalog\n1,2,3\n");
    const before = read(folder, "project.yaml");
    const { code, output } = ingestron(
      "source",
      "import",
      "erp",
      "sources/erp.catalog.csv",
      "--env",
      "dev",
    );
    expect(code).toBe(1);
    expect(output).not.toBe("");
    expect(output).not.toContain("Wrote");
    expect(existsSync(join(folder, "sources/erp.yaml"))).toBe(false);
    expect(read(folder, "project.yaml")).toBe(before);
  });

  it("refuses the metadata document itself", () => {
    const { folder, ingestron } = withCatalog();
    ingestron("source", "import", "erp", "sources/erp.catalog.csv", "--env", "dev");
    const { code, output } = ingestron(
      "source",
      "import",
      "erp",
      "sources/erp.yaml",
      "--env",
      "dev",
    );
    expect(code).toBe(1);
    expect(output).toBe(
      "sources/erp.yaml is source metadata already; import the file it was made from.\n",
    );
    expect(read(folder, "sources/erp.yaml")).toBe(imports("erp.first.yaml"));
  });

  it("exits 1 for a connection the project lacks", () => {
    const { ingestron } = withCatalog();
    const { code, output } = ingestron(
      "source",
      "import",
      "nope",
      "sources/erp.catalog.csv",
      "--env",
      "dev",
    );
    expect(code).toBe(1);
    expect(output).toBe(
      '"nope" is not a connection of the project. Connections: crm, erp, landing.\n',
    );
  });

  it("exits 1 for a file that is not there", () => {
    const { code, output } = sourceProject("request").ingestron(
      "source",
      "import",
      "erp",
      "sources/missing.csv",
      "--env",
      "dev",
    );
    expect(code).toBe(1);
    expect(output).toBe("There is no file sources/missing.csv.\n");
  });

  it("exits 1 for a folder given as the file, as for a file that is not there", () => {
    const { folder, ingestron } = sourceProject("request");
    const { code, output } = ingestron("source", "import", "erp", "sources", "--env", "dev");
    expect(code).toBe(1);
    expect(output).toBe("There is no file sources.\n");
    expect(existsSync(join(folder, "sources/erp.yaml"))).toBe(false);
  });

  it("exits 1 for a recipe that breaks a rule, and for a recipe the connection names that is not there", () => {
    const broken = withCatalog();
    writeFileSync(join(broken.folder, "recipes/sqlserver.yaml"), "id: sqlserver\ntitle: [\n");
    const first = broken.ingestron(
      "source",
      "import",
      "erp",
      "sources/erp.catalog.csv",
      "--env",
      "dev",
    );
    expect(first.code).toBe(1);
    expect(first.output).not.toBe("");
    expect(existsSync(join(broken.folder, "sources/erp.yaml"))).toBe(false);

    const missing = withCatalog();
    const path = join(missing.folder, "connections/erp.yaml");
    writeFileSync(
      path,
      read(missing.folder, "connections/erp.yaml").replace("from: sqlserver", "from: nothere"),
    );
    const second = missing.ingestron(
      "source",
      "import",
      "erp",
      "sources/erp.catalog.csv",
      "--env",
      "dev",
    );
    expect(second.code).toBe(1);
    expect(second.output).toContain(
      'The connection "erp" names the recipe "nothere", which does not exist. Recipes:',
    );
  });

  it("writes nothing when project.yaml is not valid YAML (a duplicate key), not even the document", () => {
    const { folder, ingestron } = withCatalog();
    const path = join(folder, "project.yaml");
    writeFileSync(path, `${read(folder, "project.yaml")}id: retail\n`);
    const { code, output } = ingestron(
      "source",
      "import",
      "erp",
      "sources/erp.catalog.csv",
      "--env",
      "dev",
    );
    expect(code).toBe(1);
    expect(output).not.toContain("Wrote");
    expect(existsSync(join(folder, "sources/erp.yaml"))).toBe(false);
  });

  it("stops on definitions that cannot be loaded, as plan writes them, and writes nothing", () => {
    const { folder, ingestron } = withCatalog();
    writeFileSync(join(folder, "project.yaml"), "id: retail\nimports: [\n");
    const { code, output } = ingestron(
      "source",
      "import",
      "erp",
      "sources/erp.catalog.csv",
      "--env",
      "dev",
    );
    expect(code).toBe(1);
    expect(output).not.toBe("");
    expect(output).not.toContain("Wrote");
    expect(existsSync(join(folder, "sources/erp.yaml"))).toBe(false);
  });
});
