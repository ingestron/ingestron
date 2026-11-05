// generatedOutputs: what plan would write, at the paths apply writes them, with
// what plan prints first, for an editor to preview and to show as problems.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { nodeFiles } from "@ingestron/config";
import { describe, expect, it } from "vitest";
import { generatedOutputs, packs } from "../src/index.js";
import { edit, workspace } from "./workspace.js";

describe("generatedOutputs", () => {
  it("gives every file at the path apply writes it, ADF's under factory/", () => {
    const { folder, ingestron } = workspace("private-sql-server");
    expect(ingestron("apply").code).toBe(0);
    const generated = generatedOutputs(nodeFiles(folder));
    expect(generated.ok).toBe(true);
    expect(generated.outputs.map(({ folder, targets }) => [folder, targets])).toEqual([
      ["databricks", ["dev", "prod"]],
      ["adf", ["dev", "prod"]],
    ]);
    const adf = generated.outputs.find((output) => output.name === "adf")!;
    expect(adf.byEnvironment).toBe(false);
    expect(Object.keys(adf.files)).toContain("factory/pipeline/pl_erp_erp.json");
    expect(Object.keys(adf.files)).toContain("parameters/prod.json");
    for (const output of generated.outputs)
      for (const [path, text] of Object.entries(output.files))
        expect(readFileSync(join(folder, "build", output.folder, path), "utf8")).toBe(text);
  });

  it("gives a pack's notices as plan prints them, and still the files", () => {
    const { folder } = workspace("private-sql-server");
    const generated = generatedOutputs(nodeFiles(folder));
    expect(generated.ok).toBe(true);
    expect(generated.packReports.map(({ name }) => name)).toEqual(["adf"]);
    expect(generated.packReports[0]?.diagnostics.map(({ code }) => code)).toEqual(["PACK_NOTICE"]);
    expect(generated.text).toMatch(/^adf: warnings\n\(project\) {2}warning {2}PACK_NOTICE\n/);
    expect(generated.outputs.length).toBe(2);
  });

  it("puts each environment's files in a folder of its own for a pack that builds one at a time", () => {
    const { folder } = workspace("test/fixtures/duckdb-local");
    const generated = generatedOutputs(nodeFiles(folder));
    const duckdb = generated.outputs.find((output) => output.name === "duckdb")!;
    expect(duckdb.byEnvironment).toBe(true);
    expect(duckdb.targets).toEqual(["dev", "local"]);
    expect(Object.keys(duckdb.files)).toContain("local/tables/silver.customer_totals.sql");
  });

  it("gives no files, and the problems plan prints, when an environment has problems", () => {
    const { folder } = workspace("retail", (root) =>
      edit(root, "standard.yaml", "databricks@2", "databricks@1"),
    );
    const generated = generatedOutputs(nodeFiles(folder));
    expect(generated.ok).toBe(false);
    expect(generated.outputs).toEqual([]);
    expect(generated.text).toMatch(/^dev, prod: the definitions have problems\n/);
    expect(generated.environmentReports.map(({ name, failed }) => [name, failed])).toEqual([
      ["dev", true],
      ["prod", true],
    ]);
  });

  it("prints nothing first for a project without problems", () => {
    const { folder } = workspace("retail");
    expect(generatedOutputs(nodeFiles(folder)).text).toBe("");
  });

  it("names each value the deploying pipeline supplies, as the files take it", () => {
    const { folder } = workspace("retail", (root) =>
      edit(
        root,
        "connections/shop.yaml",
        "abfss://landing@${values.storage_account}.dfs.core.windows.net/shop",
        "${envvar:INGT_LANDING}/shop",
      ),
    );
    const databricks = generatedOutputs(nodeFiles(folder), { envvars: {} }).outputs[0];
    expect(databricks?.deployValues).toEqual([
      { name: "INGT_LANDING", suppliedAs: ["BUNDLE_VAR_ingt_landing"] },
    ]);
  });

  it("reads the variables it is given, in place of the host's", () => {
    const { folder } = workspace("duckdb", (root) =>
      edit(root, "flows/orders.yaml", "source: shop", "source: ${envvar:INGT_SRC}"),
    );
    expect(generatedOutputs(nodeFiles(folder), { envvars: {} }).ok).toBe(false);
    expect(generatedOutputs(nodeFiles(folder), { envvars: { INGT_SRC: "shop" } }).ok).toBe(true);
  });

  it("gives PACK_LOAD, in place of throwing, for packs it is given that cannot be loaded", () => {
    const { folder } = workspace();
    const broken = { ...packs[0]!, id: "broken", platformFields: ["schedule.nowhere"] };
    const generated = generatedOutputs(nodeFiles(folder), { packs: [...packs, broken] });
    expect(generated.ok).toBe(false);
    expect(generated.outputs).toEqual([]);
    expect(generated.refused?.code).toBe("PACK_LOAD");
    expect(generated.text).toMatch(/^\(project\) {2}error {2}PACK_LOAD\n {2}The pack "broken"/);
  });

  it("names the environments deployed by a pack that builds them together, even when one fails", () => {
    const deployed = (example: string, change?: (root: string) => void) =>
      generatedOutputs(nodeFiles(workspace(example, change).folder), { envvars: {} }).deployed;
    expect(deployed("retail")).toEqual(["dev", "prod"]);
    expect(deployed("test/fixtures/duckdb-local")).toEqual(["dev"]);
    expect(deployed("duckdb")).toEqual([]);
    const failing = (root: string) =>
      edit(root, "flows/shop.yaml", "source: shop", "source: ${envvar:INGT_SRC}");
    expect(deployed("retail", failing)).toEqual(["dev", "prod"]);
  });
});
