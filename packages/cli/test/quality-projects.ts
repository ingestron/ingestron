// One medallion project with checks, cleansing, time zones, quarantine and results, built
// for each engine: bronze keeps the files as they come; silver cleanses, deduplicates,
// checks and quarantines, and keeps its checks' results. The packs' quality fixtures, with
// a data product so that passports are written. Written to a temporary folder.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** The engines, one route each. */
export type Engine = "databricks" | "duckdb" | "synapse" | "landing";

import {
  contract,
  customersClean,
  flow,
  orders,
  ordersClean,
  product,
  standard,
} from "./quality-files.js";

const imports = `imports:
  - standard.yaml
  - platform.yaml
  - connections/*.yaml
  - flows/*.yaml
  - transforms/*.yaml
  - contracts/*.yaml
  - products/*.yaml
`;

const filesConnection = `apiVersion: ingestron.io/v1
kind: Connection
id: crm
description: Files the CRM exports every hour, with London wall-clock times.
connector: files
connectivity: public
timezone: Europe/London
settings:
  path: \${values.storage}/crm
`;

const sqlConnection = `apiVersion: ingestron.io/v1
kind: Connection
id: crm
description: The CRM's SQL Server, inside the corporate network, in London time.
connector: sqlserver
connectivity: private
timezone: Europe/London
settings:
  server: crm-sql01.corp.local
  user: ingest_reader
  password: \${secret:crm-sql-password}
`;

const adfStandard = `ingest:
  settings:
    adf-copy:
      layout: snapshot
      every: { frequency: Hour, interval: 24 }
      start: 2026-10-01T00:00:00Z
`;

const adfPlatform = (extra: string) => `apiVersion: ingestron.io/v1
kind: Platform
id: azure
settings:
  adf-copy:
    landing: \${values.landing}
    key_vault: \${values.key_vault}
    integration_runtime: shir-crm
${extra}`;

const adfValues = (
  environment: string,
) => `      landing: abfss://landing@crm${environment}.dfs.core.windows.net/crm
      storage: abfss://landing@crm${environment}.dfs.core.windows.net
      key_vault: https://kv-crm-${environment}.vault.azure.net
`;

const adfProject = `id: crm
name: Customer records
environments:
  dev:
    values:
${adfValues("dev")}  prod:
    values:
${adfValues("prod")}${imports}`;

/** Each engine's files, by path. */
const projects: Record<Engine, Record<string, string>> = {
  databricks: {
    "project.yaml": `id: crm
name: Customer records
values:
  host: https://adb-1111111111111111.1.azuredatabricks.net
  storage: abfss://landing@crmdev.dfs.core.windows.net
environments:
  dev: {}
  prod:
    values:
      host: https://adb-2222222222222222.2.azuredatabricks.net
      storage: abfss://landing@crmprod.dfs.core.windows.net
${imports}`,
    "standard.yaml": standard("databricks@2"),
    "platform.yaml": `apiVersion: ingestron.io/v1
kind: Platform
id: lakehouse
databricks:
  workspace:
    host: \${values.host}
`,
    "connections/crm.yaml": filesConnection,
    "contracts/customers.yaml": contract(
      "\n        physicalType: ARRAY<STRING>",
      ", physicalType: TIMESTAMP_NTZ",
    ),
    "flows/crm.yaml": flow("customers\n    ingest:\n      with: { format: json }", "orders"),
    "transforms/customers_clean.yaml": customersClean("updated_at >= TIMESTAMP '2000-01-01'"),
    "transforms/orders_clean.yaml": ordersClean(
      'transform: { uses: pyspark }\ncode: |\n  def transform(tables):\n      return tables["orders"].where("customer_id > 0")\n',
    ),
  },
  duckdb: {
    "project.yaml": `id: crm
name: Customer records
values:
  storage: ./in
  published: ./published
environments:
  dev: {}
${imports}`,
    "standard.yaml": standard("duckdb@2"),
    "platform.yaml": `apiVersion: ingestron.io/v1
kind: Platform
id: laptop
settings:
  duckdb-table: { published: "\${values.published}" }
`,
    "connections/crm.yaml": filesConnection,
    "contracts/customers.yaml": contract('\n        physicalType: "VARCHAR[]"', ""),
    "flows/crm.yaml": flow(
      "customers/*.parquet",
      "orders/*.csv\n    history: latest\n    sequence: updated_at\n    ingest:\n      with: { format: csv }",
    ),
    "transforms/customers_clean.yaml": customersClean("updated_at >= TIMESTAMP '2000-01-01'"),
    "transforms/orders_clean.yaml": ordersClean(
      "code: |\n  SELECT * FROM {{ tables.orders }} WHERE customer_id > 0\n",
    ),
  },
  synapse: {
    "project.yaml": adfProject,
    "standard.yaml": standard(
      "synapse@2, adf@2",
      `store:\n  default: synapse-view\n${adfStandard}`,
    ),
    "platform.yaml": adfPlatform(
      "  synapse-view:\n    data_source: landing\n    data_source_location: ${values.storage}\n",
    ),
    "connections/crm.yaml": sqlConnection,
    "contracts/customers.yaml": contract("", ""),
    "flows/crm.yaml": flow("crm.dbo.Customers", "crm.dbo.Orders"),
    "transforms/customers_clean.yaml": customersClean("[updated_at] >= '2000-01-01'"),
    "transforms/orders_clean.yaml": ordersClean(
      "code: |\n  SELECT * FROM {{ tables.orders }} WHERE customer_id > 0\n",
    ),
  },
  landing: {
    "project.yaml": adfProject,
    "standard.yaml": standard("adf@2", `store:\n  default: none\n${adfStandard}`).replace(
      /layers:[\s\S]*?(?=cleanse:)/,
      "layers:\n  - { name: bronze, does: raw }\n",
    ),
    "platform.yaml": adfPlatform(""),
    "connections/crm.yaml": sqlConnection,
    "contracts/customers.yaml": contract("", ""),
    "flows/crm.yaml": flow("crm.dbo.Customers", "crm.dbo.Orders"),
  },
};

/** The engine's project in a new temporary folder; `change` edits the files first. */
export function qualityProject(
  engine: Engine,
  change: (files: Record<string, string>) => void = () => {},
): string {
  const folder = mkdtempSync(join(tmpdir(), `ingestron-quality-${engine}-`));
  const files = {
    ...projects[engine],
    "contracts/orders.yaml": orders,
    "products/crm.yaml": product,
  };
  change(files);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    writeFileSync(join(folder, path), text);
  }
  return folder;
}
