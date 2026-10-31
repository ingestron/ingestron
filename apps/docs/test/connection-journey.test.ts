// The commands and downloadable examples used in the connection-first reader journey.
import { mkdtempSync, readFileSync, cpSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "@ingestron/cli";
import { parse, stringify } from "yaml";
import { expect, it } from "vitest";
import { exampleFolder, readExampleFile } from "../lib/examples.js";

it("shows the same files that the first-project command creates", () => {
  const cwd = mkdtempSync(join(tmpdir(), "docs-first-project-"));
  const code = run(
    [
      "init",
      "shop",
      "--connector",
      "files",
      "--connectivity",
      "public",
      "--via",
      "databricks",
      "--env",
      "dev",
      "--yes",
    ],
    { cwd, write: () => {} },
  );
  expect(code).toBe(0);
  for (const file of [
    "project.yaml",
    "standard.yaml",
    "connections/shop.yaml",
    "flows/orders.yaml",
  ])
    expect(parse(readFileSync(join(cwd, "shop", file), "utf8"))).toEqual(
      parse(readExampleFile("connection-first-files", file)),
    );
});
it("uses one compatible standard for ADF ingestion and Databricks storage", () => {
  const cwd = mkdtempSync(join(tmpdir(), "docs-adf-project-"));
  const standard = join(exampleFolder("connection-first-adf"), "standard.yaml");
  let output = "";
  expect(
    run(
      [
        "init",
        "sales",
        "--connector",
        "postgresql",
        "--via",
        "adf",
        "--connectivity",
        "private",
        "--standard",
        standard,
        "--yes",
      ],
      {
        cwd,
        write: (text) => {
          output += text;
        },
      },
    ),
    output,
  ).toBe(0);
});
it("names the ADF pipeline and its trigger reference consistently in both environments", () => {
  for (const environment of ["dev", "prod"]) {
    const pipeline = `pl_sales_orders_${environment}`;
    const root = `build/${environment}/adf`;
    expect(
      JSON.parse(readExampleFile("connection-first-adf", `${root}/pipeline/${pipeline}.json`)).name,
    ).toBe(pipeline);
    const trigger = JSON.parse(
      readExampleFile(
        "connection-first-adf",
        `${root}/trigger/tr_sales_orders_${environment}.json`,
      ),
    );
    expect(trigger.properties.pipeline.pipelineReference.referenceName).toBe(pipeline);
  }
});

it("shows the documented policy failure and rename plan on a copy of the download", () => {
  const cwd = mkdtempSync(join(tmpdir(), "docs-adf-exercises-"));
  cpSync(exampleFolder("connection-first-adf"), cwd, { recursive: true });
  const flowPath = join(cwd, "flows/postgresql.yaml");
  const original = readFileSync(flowPath, "utf8");
  const flow = parse(original);
  flow.tables.postgresql_records.store = { with: { cluster_by: "none" } };
  writeFileSync(flowPath, stringify(flow));
  let output = "";
  const io = {
    cwd,
    write: (text: string) => {
      output += text;
    },
  };
  expect(run(["plan", "--env", "dev", "--no-diff"], io)).toBe(1);
  expect(output).toContain("FIXED_SETTING");
  writeFileSync(flowPath, original);
  const projectPath = join(cwd, "project.yaml");
  const project = parse(readFileSync(projectPath, "utf8"));
  project.values.resource_prefix = "sales_v2";
  writeFileSync(projectPath, stringify(project));
  output = "";
  expect(run(["plan", "--env", "dev", "--no-diff"], io)).toBe(0);
  expect(output).toContain("create    pipeline/pl_sales_v2_orders_dev.json");
  expect(output).toContain("delete    pipeline/pl_sales_orders_dev.json");
});
