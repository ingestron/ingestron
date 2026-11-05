// The starters with every REPLACE_ME written, as a user writes them before deploying, for the
// tests that need a project that checks clean. The values are the starters' earlier examples.
import { cpSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { applySet } from "../src/init-set.js";

const storage = (dev: string, prod: string) => ({
  "dev.storage_account": dev,
  "prod.storage_account": prod,
});

/** What each starter's REPLACE_ME are written as, by their names (spec/cli/projects.md). */
export const starterValues: Record<string, Record<string, string>> = {
  minimal: { landing: "/Volumes/dev/landing/shop" },
  pyspark: { source_path: "/Volumes/dev/landing/billing" },
  "sql-server": {
    source_uc_connection: "erp_sqlserver_${environment.name}",
    customers_object: "erp.dbo.Customers",
    invoices_object: "erp.dbo.Invoices",
  },
  salesforce: { source_uc_connection: "salesforce_prod" },
  kafka: {
    source_uc_connection: "web_events_kafka",
    page_views_object: "web.page-views",
    purchases_object: "web.purchases",
  },
  retail: {
    run_as: "7f3c2a10-0000-4000-8000-000000000001",
    engineers: "sales-engineers",
    analysts: "sales-analysts",
    on_failure: "sales-data@example.com",
    "dev.host": "https://adb-1111111111111111.1.azuredatabricks.net",
    "prod.host": "https://adb-2222222222222222.2.azuredatabricks.net",
    ...storage("retaildev", "retailprod"),
  },
  "private-files": {
    ...storage("storeslakedev", "storeslakeprod"),
    "dev.key_vault": "kv-stores-dev",
    "prod.key_vault": "kv-stores-prod",
    integration_runtime: "shir-stores",
    source_path: "\\\\fs01\\exports",
    source_user: "corp\\ingest",
  },
  "private-sql-server": {
    ...storage("erplakedev", "erplakeprod"),
    "dev.key_vault": "kv-erp-dev",
    "prod.key_vault": "kv-erp-prod",
    integration_runtime: "shir-erp",
    source_server: "erp-sql01.corp.local",
    source_user: "ingest_reader",
    customers_object: "erp.dbo.Customers",
    invoices_object: "erp.dbo.Invoices",
  },
};

/** Writes the starter's values into its copy in `folder`; a starter with none is left as it is. */
export function fillStarter(folder: string, starter: string): void {
  const values = starterValues[starter];
  if (!values) return;
  const paths = yamlFiles(folder);
  const files = Object.fromEntries(
    paths.map((path) => [path, readFileSync(join(folder, path), "utf8")]),
  );
  applySet(files, values, ["dev", "prod"]);
  for (const path of paths) writeFileSync(join(folder, path), String(files[path]));
}

/** A copy of the starter, without its README and template.yaml, with every value written. */
export function filledStarter(starter: string): string {
  const folder = mkdtempSync(join(tmpdir(), `ingestron-${starter}-`));
  cpSync(join(import.meta.dirname, "../project-templates", starter), folder, { recursive: true });
  fillStarter(folder, starter);
  return folder;
}

function yamlFiles(folder: string, under = folder): string[] {
  return readdirSync(under).flatMap((entry) => {
    const path = join(under, entry);
    if (statSync(path).isDirectory()) return entry === "build" ? [] : yamlFiles(folder, path);
    return /\.ya?ml$/.test(entry) ? [relative(folder, path)] : [];
  });
}
