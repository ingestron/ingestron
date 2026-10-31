// The ADF and Databricks packs in one standard: ADF copies a private SQL Server
// into the landing folder, and Databricks reads the files from there.
import { memoryFiles } from "@ingestron/config";
import { resolveDefinitions } from "@ingestron/definitions";
import { adf } from "@ingestron/pack-adf";
import { databricks } from "@ingestron/pack-databricks";
import { describe, expect, it } from "vitest";

const landing = "abfss://landing@erplake.dfs.core.windows.net/erp";

const contract = (amount: string) =>
  [
    "apiVersion: v3.1.0",
    "kind: DataContract",
    "id: invoices",
    "version: 1.0.0",
    "status: active",
    "schema:",
    "  - name: invoices",
    "    logicalType: object",
    "    properties:",
    "      - { name: invoice_id, logicalType: integer, required: true, primaryKey: true }",
    `      - ${amount}`,
    "      - { name: modified_at, logicalType: timestamp }",
    "",
  ].join("\n");

const base: Record<string, string> = {
  "project.yaml": "id: erp\nenvironments: { dev: {}, prod: {} }\nimports: ['*.yaml']\n",
  "standard.yaml": [
    "apiVersion: ingestron.io/v1",
    "kind: Standard",
    "id: acme",
    "packs: [databricks@1, adf@1]",
    "ingest:",
    "  settings:",
    "    adf-copy:",
    `      landing: ${landing}`,
    "      integration_runtime: shir-erp",
    "      key_vault: https://kv-erp.vault.azure.net",
    "      start: 2026-10-01T00:00:00Z",
    "",
  ].join("\n"),
  "erp.yaml": [
    "apiVersion: ingestron.io/v1",
    "kind: Connection",
    "id: erp",
    "connector: sqlserver",
    "connectivity: private",
    "settings:",
    "  server: erp-sql01.corp.local",
    "  user: ingest_reader",
    "  password: ${secret:erp-sql-password}",
    "",
  ].join("\n"),
  "flow.yaml":
    "apiVersion: ingestron.io/v1\nkind: Flow\nid: erp\nsource: erp\ntables:\n  invoices: { object: erp.dbo.Invoices, contract: invoices }\n",
  "invoices.yaml": contract("{ name: amount, logicalType: number }"),
};

function generate(changes: Record<string, string> = {}, environment = "dev") {
  const result = resolveDefinitions(memoryFiles({ ...base, ...changes }), {
    packs: [databricks, adf],
    environment,
  });
  if (!result.model) throw new Error(JSON.stringify(result.diagnostics));
  return { model: result.model, bundle: databricks.build(result.model) };
}

const platform = (lines: string[]) => ({
  "platform.yaml": ["apiVersion: ingestron.io/v1", "kind: Platform", "id: lake", ...lines, ""].join(
    "\n",
  ),
});

describe("ADF ingestion stored by Databricks", () => {
  it("stores what ADF copies with a streaming table over the landing folder", () => {
    const { model, bundle } = generate();
    expect(model.tables[0]?.ingest).toMatchObject({ method: "adf-copy", pack: "adf" });
    expect(model.tables[0]?.store).toMatchObject({ method: "streaming-table", pack: "databricks" });
    expect(bundle["src/erp/bronze/invoices.sql"]).toContain(
      `'${landing}/erp.dbo.Invoices',\n  format => 'parquet'`,
    );
  });

  it("reads the copied files as they are when a column is renamed at the source", () => {
    const { bundle } = generate({
      "invoices.yaml": contract("{ name: amount, logicalType: number, physicalName: amt }"),
    });
    expect(bundle["src/erp/bronze/invoices.sql"]).toContain("AS SELECT * FROM STREAM read_files(");
  });

  it("pauses the Databricks job with the platform's schedule", () => {
    const { bundle } = generate(
      platform(["schedule: { cron: '0 0 * * * ?', paused: true }"]),
      "prod",
    );
    expect(bundle["resources/erp_refresh.job.yml"]).toContain("pause_status: PAUSED");
  });

  it("leaves the Databricks job running when only the ADF copy is paused", () => {
    const changes = platform([
      "schedule: { cron: '0 0 * * * ?' }",
      "settings:",
      "  adf-copy: { paused: true }",
    ]);
    expect(generate(changes, "prod").bundle["resources/erp_refresh.job.yml"]).toContain(
      "pause_status: UNPAUSED",
    );
  });
});
