// Platform-first setup and independent additions exercise the shared CLI/core path.
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { nodeFiles } from "@ingestron/config";
import { draftConnection, draftFlow, projectAdditions, projectPlatforms } from "@ingestron/core";
import { parse } from "yaml";
import { run } from "../src/index.js";

const folders: string[] = [];
afterAll(() => folders.forEach((folder) => rmSync(folder, { recursive: true, force: true })));
function lab() {
  const cwd = mkdtempSync(join(tmpdir(), "standard-first-"));
  folders.push(cwd);
  let output = "";
  const invoke = (...args: string[]) => {
    output = "";
    return run(args, {
      cwd,
      write: (text) => {
        output += text;
      },
    });
  };
  return {
    cwd,
    invoke,
    output: () => output,
    read: (file: string) => readFileSync(join(cwd, file), "utf8"),
  };
}

it.each(projectPlatforms())("creates $id before selecting any source", ({ id }) => {
  const test = lab();
  expect(test.invoke("init", ".", "--platform", id, "--yes"), test.output()).toBe(0);
  const names = readdirSync(test.cwd, { recursive: true }).map(String);
  expect(names).toEqual(
    expect.arrayContaining(["project.yaml", "platform.yaml", "standard.yaml", "README.md"]),
  );
  for (const file of names.filter((name) => /\.ya?ml$/.test(name)))
    expect(["Connection", "Flow", "DataContract", "Transform"]).not.toContain(
      parse(test.read(file))?.kind,
    );
  expect(test.read("README.md")).toContain("Add connection");
  expect(test.read("README.md")).toContain("Add flow");
  expect(test.output()).not.toContain("the project runs as written");
  // A new project is written in the current layout: nothing it starts with has moved.
  expect(test.output()).not.toContain("PLATFORM_FIELD_MOVED");
  // Its lists are of the project as it starts: nothing it says goes wrong once sources are added.
  const readme = test.read("README.md");
  expect(readme).toContain("Its lists show the project as it starts, with no flow.");
  expect(readme).toMatch(/`ingestron request --env \w+` what the platform needs/);
  expect(readme).toContain("None yet: the project has no connection.");
  expect(readme).toContain("Nothing to deploy yet: add a flow");
  expect(readme).not.toContain("no connection here names a Key Vault secret");
  expect(readme).not.toContain("the definitions have problems to fix");
});

it("preserves a supplied standard's fixed settings and dates", () => {
  const test = lab();
  const standard =
    "apiVersion: ingestron.io/v1\nkind: Standard\nid: central\npacks: [synapse@2]\ningest:\n  fixed:\n    synapse-copy: { format: parquet, start: '2026-01-01T00:00:00Z' }\n";
  writeFileSync(join(test.cwd, "central.yaml"), standard);
  expect(
    test.invoke("init", "project", "--platform", "synapse", "--standard", "central.yaml", "--yes"),
    test.output(),
  ).toBe(0);
  expect(test.read("project/standard.yaml")).toBe(`# From central.yaml\n${standard}`);
});

it("adds independent connections and flows, preserving standard and platform", () => {
  const test = lab();
  expect(test.invoke("init", ".", "--platform", "synapse", "--yes"), test.output()).toBe(0);
  const standard = test.read("standard.yaml");
  const platform = test.read("platform.yaml");
  expect(
    test.invoke(
      "connection",
      "add",
      "northwind",
      "--connector",
      "azure-sql-database",
      "--connectivity",
      "public",
      "--set",
      "server=demo.database.windows.net",
    ),
    test.output(),
  ).toBe(0);
  expect(test.read("connections/northwind.yaml")).toContain("${secret:northwind-password}");
  expect(test.read("connections/northwind.yaml")).toContain("demo.database.windows.net");
  expect(projectAdditions(nodeFiles(test.cwd)).connections).toHaveLength(1);
  expect(test.invoke("source", "request", "--connection", "northwind"), test.output()).toBe(0);
  expect(test.output()).toContain("northwind.catalog.csv");
  expect(
    test.invoke(
      "flow",
      "add",
      "orders",
      "--connection",
      "northwind",
      "--object",
      "northwind.dbo.Order Details",
    ),
    test.output(),
  ).toBe(0);
  const flow = parse(test.read("flows/orders.yaml"));
  expect(flow.tables.order_details.object).toBe("northwind.dbo.Order Details");
  expect(flow.ingest.uses).toBe("synapse-copy");
  expect(test.read("standard.yaml")).toBe(standard);
  expect(test.read("platform.yaml")).toBe(platform);
});

it("refuses unsupported connectors, plaintext secrets and existing ids without writing", () => {
  const test = lab();
  test.invoke("init", ".", "--platform", "synapse", "--yes");
  const files = nodeFiles(test.cwd);
  const input = { id: "northwind", connector: "azure-sql-database", connectivity: "public" };
  expect(() => draftConnection(files, { ...input, connector: "salesforce" })).toThrow(
    "no ingestion method",
  );
  expect(() =>
    draftConnection(files, { ...input, settings: { password: "a-test-value" } }),
  ).toThrow("named");
  test.invoke(
    "connection",
    "add",
    "northwind",
    "--connector",
    input.connector,
    "--connectivity",
    "public",
  );
  const before = test.read("connections/northwind.yaml");
  expect(
    test.invoke(
      "connection",
      "add",
      "northwind",
      "--connector",
      input.connector,
      "--connectivity",
      "public",
    ),
  ).toBe(1);
  expect(test.read("connections/northwind.yaml")).toBe(before);
  expect(() =>
    draftFlow(nodeFiles(test.cwd), {
      id: "orders",
      connection: "northwind",
      objects: ["dbo.Orders"],
      method: "adf-copy",
    }),
  ).toThrow("supported ingestion method");
});

it("requires an explicit connection profile when two standard packs support the connector", () => {
  const test = lab();
  test.invoke("init", ".", "--platform", "synapse", "--yes");
  writeFileSync(
    join(test.cwd, "standard.yaml"),
    test.read("standard.yaml").replace("[synapse@2]", "[synapse@2, adf@2]"),
  );
  const input = { id: "northwind", connector: "azure-sql-database", connectivity: "public" };
  expect(() => draftConnection(nodeFiles(test.cwd), input)).toThrow("--method");
  expect(
    test.invoke(
      "connection",
      "add",
      "northwind",
      "--connector",
      input.connector,
      "--connectivity",
      "public",
      "--method",
      "synapse-copy",
    ),
    test.output(),
  ).toBe(0);
  expect(test.read("connections/northwind.yaml")).toContain("azure-sql-database");
});
