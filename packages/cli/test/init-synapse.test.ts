// Workspace ingestion is available from the same project builder used by the editor.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { projectRoutes, sourceOrigin, sourceRecipes } from "@ingestron/core";
import { run } from "../src/index.js";

const folders: string[] = [];
afterAll(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
});

describe("Synapse workspace project", () => {
  it("offers the supported workspace route and keeps private sources on their existing routes", () => {
    expect(
      projectRoutes("azure-sql-database", "public").some((route) => route.via === "synapse"),
    ).toBe(true);
    expect(
      projectRoutes("azure-sql-database", "private").some((route) => route.via === "synapse"),
    ).toBe(false);
    expect(
      projectRoutes("azure-sql-database", "public").some((route) => route.via === "adf-synapse"),
    ).toBe(true);
  });
  it("creates a workspace project with editor guidance and an existing runtime reference", () => {
    const cwd = mkdtempSync(join(tmpdir(), "synapse-init-"));
    folders.push(cwd);
    let output = "";
    const code = run(
      ["init", "sales", "--connector", "azure-sql-database", "--via", "synapse", "--yes"],
      {
        cwd,
        write: (text) => {
          output += text;
        },
      },
    );
    expect(code, output).toBe(0);
    const read = (name: string) => readFileSync(join(cwd, "sales", name), "utf8");
    expect(read("standard.yaml")).toContain("synapse@2");
    expect(read("standard.yaml")).not.toContain("adf@2");
    expect(read("platform.yaml")).toContain("synapse-copy");
    expect(read("platform.yaml")).toContain("AutoResolveIntegrationRuntime");
    expect(read("README.md")).toContain("Build and review in VS Code");
    expect(read("README.md")).toContain("These actions do not deploy");
    expect(read("README.md")).toContain("workspace/<environment>/");
    expect(read("README.md")).toContain("do not support `${envvar:NAME}`");
  });
  it("selects the SQL Server catalogue recipe for Azure SQL without manual recipe setup", () => {
    const origin = sourceOrigin({ id: "sql", connector: "azure-sql-database" }, sourceRecipes());
    expect(origin.problems).toEqual([]);
    expect(origin.recipe?.id).toBe("sqlserver");
  });
});
