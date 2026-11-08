// The output folders as a user meets them (spec/cli/outputs.md): one per pack for every
// environment, --env refused, a value the same in some environments, a project of one
// environment, an environment that runs on DuckDB beside cloud environments, and a pack's
// notices.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { packs } from "@ingestron/core";
import { edit, workspace } from "./workspace.js";

describe("--env", () => {
  for (const command of ["plan", "apply", "check"])
    it(`is refused by ${command}, which generates every environment together`, () => {
      const { folder, ingestron } = workspace();
      const { code, output } = ingestron(command, "--env", "dev");
      expect(code).toBe(2);
      expect(output.split("\n\n")[0]).toBe(
        `Every environment is generated together, so ${command} does not take --env. Use compare for two environments, or request for one.`,
      );
      expect(output).toContain("Usage: ingestron");
      expect(existsSync(join(folder, "build"))).toBe(false);
    });
});

describe("a value the same in test and prod but not in dev", () => {
  it("is a bundle variable set in every target, from the targets in project.yaml's order", () => {
    const { folder, ingestron } = workspace("test/fixtures/environments", (root) =>
      edit(
        root,
        "project.yaml",
        "/Volumes/test_landing/finance/files",
        "/Volumes/prod_landing/finance/files",
      ),
    );
    const apply = ingestron("apply");
    expect(apply.code, apply.output).toBe(0);
    expect(apply.output).toContain("databricks → build/databricks (dev, test, prod)");
    const bundle = parse(readFileSync(join(folder, "build/databricks/databricks.yml"), "utf8"));
    expect(Object.keys(bundle.targets)).toEqual(["dev", "test", "prod"]);
    expect(bundle.variables.ledger_path).toEqual({
      description: 'Folder the files of connection "ledger" are read from.',
    });
    const paths = ["dev", "test", "prod"].map(
      (target) => bundle.targets[target].variables.ledger_path,
    );
    expect(paths).toEqual([
      "/Volumes/dev_landing/finance/files/ledger",
      "/Volumes/prod_landing/finance/files/ledger",
      "/Volumes/prod_landing/finance/files/ledger",
    ]);
    expect(ingestron("check").code).toBe(0);
  });
});

describe("a project with one environment", () => {
  it("gives a bundle with one target and a factory with one parameter file", () => {
    const { folder, ingestron } = workspace("private-files", (root) =>
      edit(root, "project.yaml", /  prod:\n( {4}.*\n)+/, ""),
    );
    const apply = ingestron("apply");
    expect(apply.code, apply.output).toBe(0);
    expect(apply.output).toContain("databricks → build/databricks (dev)");
    expect(apply.output).toContain("adf → build/adf (dev)");
    const bundle = parse(readFileSync(join(folder, "build/databricks/databricks.yml"), "utf8"));
    expect(Object.keys(bundle.targets)).toEqual(["dev"]);
    expect(readdirSync(join(folder, "build/adf/parameters"))).toEqual(["dev.json"]);
    expect(ingestron("check").code).toBe(0);
  });
});

describe("an environment that runs on DuckDB beside cloud environments", () => {
  it("is left out of the bundle and the factory, and has its own folder under build/duckdb", () => {
    const { folder, ingestron } = workspace("private-files", (root) => {
      edit(
        root,
        "project.yaml",
        "environments:\n",
        "values:\n  store: streaming-table\nenvironments:\n",
      );
      edit(
        root,
        "project.yaml",
        "      key_vault: kv-stores-prod\n",
        "      key_vault: kv-stores-prod\n  laptop:\n    runs-on: duckdb\n    values: { store: duckdb-table, storage_account: storeslakedev, key_vault: kv-stores-dev }\n",
      );
      edit(root, "standard.yaml", "[databricks@2, adf@2]", "[databricks@2, adf@2, duckdb@2]");
      edit(
        root,
        "standard.yaml",
        "      start: 2026-10-01T00:00:00Z\n",
        "      start: 2026-10-01T00:00:00Z\n    duckdb-landed: { landing: ./samples }\n",
      );
      writeFileSync(
        join(root, "standard.yaml"),
        `${readFileSync(join(root, "standard.yaml"), "utf8")}store:\n  default: \${values.store}\n  settings:\n    duckdb-table: { published: ./published }\n`,
      );
    });
    const apply = ingestron("apply");
    expect(apply.code, apply.output).toBe(0);
    expect(apply.output).toContain("databricks → build/databricks (dev, prod)");
    expect(apply.output).toContain("adf → build/adf (dev, prod)");
    expect(apply.output).toContain("duckdb → build/duckdb (laptop)");
    const bundle = parse(readFileSync(join(folder, "build/databricks/databricks.yml"), "utf8"));
    expect(Object.keys(bundle.targets)).toEqual(["dev", "prod"]);
    expect(readdirSync(join(folder, "build/adf/parameters"))).toEqual(["dev.json", "prod.json"]);
    expect(readdirSync(join(folder, "build/duckdb"))).toEqual([".generated.json", "laptop"]);
    expect(readFileSync(join(folder, "build/duckdb/laptop/run.sql"), "utf8")).toContain(
      "./samples/",
    );
    expect(readFileSync(join(folder, "build/duckdb/laptop/README.md"), "utf8")).toContain(
      'duckdb -bail ingestron.duckdb -c ".read build/duckdb/laptop/run.sql"',
    );
    expect(ingestron("check").code).toBe(0);
  });
});

describe("a pack's notices", () => {
  it("are shown when generating a private starter, whose files are still written", () => {
    const { folder, ingestron } = workspace("private-files");
    const apply = ingestron("apply");
    expect(apply.code, apply.output).toBe(0);
    expect(apply.output.split("\ndatabricks → ")[0]).toBe(
      [
        "adf: warnings",
        "(project)  warning  PACK_NOTICE",
        "  Integration runtime `shir-stores` (self-hosted): the deployment writes it by name and type, as Data Factory Studio does; where it creates it, register a node, with network access and any required source drivers, before the copies run.",
        "  Before the first deployment to a factory that already has these integration runtimes, run `az deployment group what-if` with the template and that environment's parameter file, and check that it changes no runtime in a way you did not describe.",
      ].join("\n"),
    );
    expect(existsSync(join(folder, "build/adf/factory/integrationRuntime/shir-stores.json"))).toBe(
      true,
    );
    expect(ingestron("check").code).toBe(0);
  });
});

describe("the packs", () => {
  it("have no pack with the id products, the passports' folder", () => {
    expect(packs.map((pack) => pack.id)).not.toContain("products");
  });
});
