// One project with access, built for each engine: a contract with roles, a layer's role, a
// masked column and a row filter, with exact grants. On Databricks every switch is on, so it
// is all enforced; DuckDB has no access control, so none of it is. Written to a temporary
// folder.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** The engines, one route each. */
export type AccessEngine = "databricks" | "duckdb";

const imports = `imports:
  - standard.yaml
  - platform.yaml
  - connections/*.yaml
  - flows/*.yaml
  - contracts/*.yaml
  - products/*.yaml
`;

const standard = (packs: string) => `apiVersion: ingestron.io/v1
kind: Standard
id: governed
packs: [${packs}]
layers:
  - name: bronze
    does: [check]
    access:
      roles: [{ role: data-engineers, access: write }]
  - silver
governance:
  classification: { sensitive: [confidential] }
  access: { grants: exact }
  masks: { confidential: hash }
  filters:
    region_rows: { function: region_filter, match: { tag: region } }
`;

const shared: Record<string, string> = {
  "connections/crm.yaml": `apiVersion: ingestron.io/v1
kind: Connection
id: crm
description: Files the CRM exports every hour.
connector: files
connectivity: public
settings:
  path: \${values.storage}/crm
`,
  "flows/crm.yaml": `apiVersion: ingestron.io/v1
kind: Flow
id: crm
source: crm
tables:
  customers:
    object: customers/*.parquet
    contract: crm.customers
`,
  "contracts/customers.yaml": `apiVersion: v3.1.0
kind: DataContract
id: crm.customers
version: 1.0.0
status: active
schema:
  - name: customers
    logicalType: object
    description: CRM customers.
    properties:
      - { name: id, logicalType: integer, required: true, primaryKey: true }
      - { name: email, logicalType: string, required: true, classification: confidential }
      - { name: country, logicalType: string, tags: [region] }
roles:
  - { role: marketing-analysts, access: read, description: Campaign reporting, firstLevelApprovers: mia@example.com }
  - { role: crm-loaders, access: write }
`,
  "products/crm.yaml": `apiVersion: v1.1.0
kind: DataProduct
id: crm
name: Customer records
status: active
description:
  purpose: Customers from the CRM.
team:
  members:
    - { username: mia@example.com, name: Mia Chen, role: owner }
outputPorts:
  - { name: customers, contractId: crm.customers }
`,
};

/** Each engine's own files, by path. */
const projects: Record<AccessEngine, Record<string, string>> = {
  databricks: {
    "project.yaml": `id: crm
name: Customer records
values:
  host: https://adb-1111111111111111.1.azuredatabricks.net
  storage: abfss://landing@crmdev.dfs.core.windows.net
  marketing: marketing-analysts-dev
  governance: dev_crm.governance
environments:
  dev: {}
  prod:
    values:
      host: https://adb-2222222222222222.2.azuredatabricks.net
      storage: abfss://landing@crmprod.dfs.core.windows.net
      marketing: marketing-analysts
      governance: prod_crm.governance
${imports}`,
    "standard.yaml": standard("databricks@2"),
    "platform.yaml": `apiVersion: ingestron.io/v1
kind: Platform
id: lakehouse
principals:
  marketing-analysts: \${values.marketing}
databricks:
  workspace:
    host: \${values.host}
  run_as:
    service_principal_name: 7f3c2a10-0000-4000-8000-000000000001
  manage: { tags: true, grants: true, masks: true, filters: true }
  governance:
    functions: \${values.governance}
    unmasked: [data-stewards]
`,
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
principals:
  marketing-analysts: marketing-analysts-dev
settings:
  duckdb-table: { published: "\${values.published}" }
`,
  },
};

/** The engine's project in a new temporary folder; `change` edits the files first. */
export function accessProject(
  engine: AccessEngine,
  change: (files: Record<string, string>) => void = () => {},
): string {
  const folder = mkdtempSync(join(tmpdir(), `ingestron-access-${engine}-`));
  const files = { ...shared, ...projects[engine] };
  change(files);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    writeFileSync(join(folder, path), text);
  }
  return folder;
}
