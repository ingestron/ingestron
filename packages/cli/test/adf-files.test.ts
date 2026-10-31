// Files on a private share copied by ADF into the landing folder as they are,
// then read by the Databricks pack with the files' own format.
import { memoryFiles } from "@ingestron/config";
import { resolveDefinitions } from "@ingestron/definitions";
import { databricks } from "@ingestron/pack-databricks";
import { describe, expect, it } from "vitest";
import { adf } from "@ingestron/pack-adf";

const landing = "abfss://landing@shoplake.dfs.core.windows.net/shop";

const base: Record<string, string> = {
  "project.yaml": "id: shop\nenvironments: { dev: {}, prod: {} }\nimports: ['*.yaml']\n",
  "standard.yaml": [
    "apiVersion: ingestron.io/v1",
    "kind: Standard",
    "id: acme",
    "packs: [databricks@1, adf@1]",
    "ingest:",
    "  settings:",
    "    adf-files:",
    `      landing: ${landing}`,
    "      integration_runtime: shir-shop",
    "      key_vault: https://kv-shop.vault.azure.net",
    "      start: 2026-10-01T00:00:00Z",
    "",
  ].join("\n"),
  "share.yaml": [
    "apiVersion: ingestron.io/v1",
    "kind: Connection",
    "id: share",
    "connector: files",
    "connectivity: private",
    "settings:",
    "  path: '\\\\fs01\\exports'",
    "  user: corp\\ingest",
    "  password: ${secret:fs01-password}",
    "",
  ].join("\n"),
  "flow.yaml": [
    "apiVersion: ingestron.io/v1",
    "kind: Flow",
    "id: share",
    "source: share",
    "ingest: { with: { format: csv, options: { header: true } } }",
    "tables:",
    "  orders: { object: sales/orders, contract: orders }",
    "",
  ].join("\n"),
  "orders.yaml": [
    "apiVersion: v3.1.0",
    "kind: DataContract",
    "id: orders",
    "version: 1.0.0",
    "status: active",
    "schema:",
    "  - name: orders",
    "    logicalType: object",
    "    properties:",
    "      - { name: id, logicalType: integer, required: true, primaryKey: true }",
    "",
  ].join("\n"),
};

function resolve(changes: Record<string, string> = {}, environment = "dev") {
  return resolveDefinitions(memoryFiles({ ...base, ...changes }), {
    packs: [databricks, adf],
    environment,
  });
}

function generate(changes: Record<string, string> = {}) {
  const result = resolve(changes);
  expect(result.diagnostics).toEqual([]);
  const files = adf.build(result.model!);
  const json = (path: string) => JSON.parse(files[path] ?? "null");
  return { files, json, model: result.model! };
}

describe("adf-files", () => {
  it("is chosen for files on a private share", () => {
    const { model } = generate();
    expect(model.tables[0]?.ingest?.method).toBe("adf-files");
    expect(model.tables[0]?.store?.method).toBe("streaming-table");
  });

  it("reaches the share through the self-hosted runtime, with the password from Key Vault", () => {
    const { json } = generate();
    expect(json("linkedService/ls_shop_share.json")).toEqual({
      name: "ls_shop_share",
      properties: {
        type: "FileServer",
        typeProperties: {
          host: "\\\\fs01\\exports",
          userId: "corp\\ingest",
          password: {
            type: "AzureKeyVaultSecret",
            store: { referenceName: "ls_shop_keyvault", type: "LinkedServiceReference" },
            secretName: "fs01-password",
          },
        },
        connectVia: { referenceName: "shir-shop", type: "IntegrationRuntimeReference" },
      },
    });
  });

  it("copies the files changed in the window as they are, keeping names and folders", () => {
    const { json } = generate();
    const pipeline = json("pipeline/pl_shop_share.json");
    const [copy] = pipeline.properties.activities;
    expect(copy.inputs).toEqual([
      {
        referenceName: "ds_shop_share",
        type: "DatasetReference",
        parameters: { folder: "sales\\orders" },
      },
    ]);
    expect(copy.outputs).toEqual([
      {
        referenceName: "ds_shop_landing_files",
        type: "DatasetReference",
        parameters: { folder: "shop/sales/orders" },
      },
    ]);
    const window = (name: string) =>
      `@{formatDateTime(pipeline().parameters.${name}, 'yyyy-MM-dd''T''HH:mm:ss''Z''')}`;
    expect(copy.typeProperties.source).toEqual({
      type: "BinarySource",
      storeSettings: {
        type: "FileServerReadSettings",
        recursive: true,
        wildcardFileName: "*",
        modifiedDatetimeStart: window("windowStart"),
        modifiedDatetimeEnd: window("windowEnd"),
      },
    });
    expect(copy.typeProperties.sink).toEqual({
      type: "BinarySink",
      storeSettings: { type: "AzureBlobFSWriteSettings", copyBehavior: "PreserveHierarchy" },
    });
    expect(json("dataset/ds_shop_share.json").properties.typeProperties.location).toEqual({
      type: "FileServerLocation",
      folderPath: { value: "@dataset().folder", type: "Expression" },
    });
    expect(json("trigger/tr_shop_share.json").properties.type).toBe("TumblingWindowTrigger");
  });

  it("copies every file each window with mode: all", () => {
    const flow = base["flow.yaml"]!.replace("format: csv,", "format: csv, mode: all,");
    const { json } = generate({ "flow.yaml": flow });
    const [copy] = json("pipeline/pl_shop_share.json").properties.activities;
    expect(copy.typeProperties.source.storeSettings).not.toHaveProperty("modifiedDatetimeStart");
  });

  it("lets Databricks read the landing folder with the files' own format", () => {
    const result = resolve();
    const sql = Object.entries(databricks.build(result.model!)).find(([path]) =>
      path.endsWith("orders.sql"),
    )?.[1];
    expect(sql).toContain(`'${landing}/sales/orders'`);
    expect(sql).toContain("format => 'csv'");
    expect(sql).toContain("header => true");
    expect(sql).toContain("schemaHints => '`id` BIGINT'");
  });

  it("needs the share's user, a password secret and the files' format", () => {
    const share = base["share.yaml"]!.replace("  user: corp\\ingest\n", "").replace(
      "${secret:fs01-password}",
      "plain",
    );
    const flow = base["flow.yaml"]!.replace("format: csv, ", "");
    const messages = resolve({ "share.yaml": share, "flow.yaml": flow }).diagnostics.map(
      (item) => item.message,
    );
    expect(messages.join("\n")).toMatch(/needs "format"|format/);
    const checks = resolve({ "share.yaml": share }).diagnostics.map((item) => item.message);
    expect(checks.join("\n")).toContain('the connection needs "settings.user"');
    expect(checks.join("\n")).toContain("password must be ${secret:…}");
  });
});

describe("adf-files with physical names", () => {
  it("copies the files as they are, and Databricks renames when it reads them", () => {
    const contract = base["orders.yaml"]!.replace(
      "{ name: id, logicalType: integer, required: true, primaryKey: true }",
      "{ name: id, logicalType: integer, required: true, primaryKey: true, physicalName: order_no }",
    );
    const result = resolve({ "orders.yaml": contract });
    expect(result.diagnostics).toEqual([]);
    const sql = Object.entries(databricks.build(result.model!)).find(([path]) =>
      path.endsWith("orders.sql"),
    )?.[1];
    expect(sql).toContain(
      "AS SELECT * EXCEPT (`order_no`), `order_no` AS `id` FROM STREAM read_files(",
    );
  });
});
