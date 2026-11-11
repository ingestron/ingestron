// A copy of the CLI's starters with every REPLACE_ME written, as a user writes them before
// deploying, so the editor's tests run on projects that check clean. The values are the
// starters' earlier examples.
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Each starter's REPLACE_ME, file by file, in the order written, and what each is written as. */
const values: Record<string, [file: string, written: string, value: string][]> = {
  minimal: [["project.yaml", "landing: REPLACE_ME", "landing: /Volumes/dev/landing/shop"]],
  pyspark: [["connections/billing.yaml", "path: REPLACE_ME", "path: /Volumes/dev/landing/billing"]],
  "sql-server": [
    ["connections/erp.yaml", "REPLACE_ME", "erp_sqlserver_${environment.name}"],
    ["flows/erp.yaml", "REPLACE_ME.REPLACE_ME.", "erp.dbo."],
    ["flows/erp.yaml", "REPLACE_ME.REPLACE_ME.", "erp.dbo."],
  ],
  salesforce: [["connections/salesforce.yaml", "REPLACE_ME", "salesforce_prod"]],
  kafka: [
    ["connections/events.yaml", "REPLACE_ME", "web_events_kafka"],
    ["flows/events.yaml", "REPLACE_ME", "web.page-views"],
    ["flows/events.yaml", "REPLACE_ME", "web.purchases"],
  ],
  retail: [
    ["project.yaml", "REPLACE_ME", "7f3c2a10-0000-4000-8000-000000000001"],
    ["project.yaml", "REPLACE_ME", "sales-engineers"],
    ["project.yaml", "REPLACE_ME", "sales-analysts"],
    ["project.yaml", "REPLACE_ME", "sales-data@example.com"],
    ["project.yaml", "REPLACE_ME", "https://adb-1111111111111111.1.azuredatabricks.net"],
    ["project.yaml", "REPLACE_ME", "retaildev"],
    ["project.yaml", "REPLACE_ME", "https://adb-2222222222222222.2.azuredatabricks.net"],
    ["project.yaml", "REPLACE_ME", "retailprod"],
  ],
  "private-files": [
    ["project.yaml", "REPLACE_ME", "storeslakedev"],
    ["project.yaml", "REPLACE_ME", "kv-stores-dev"],
    ["project.yaml", "REPLACE_ME", "storeslakeprod"],
    ["project.yaml", "REPLACE_ME", "kv-stores-prod"],
    ["platform.yaml", "REPLACE_ME", "shir-stores"],
    ["connections/share.yaml", "path: REPLACE_ME", "path: '\\\\fs01\\exports'"],
    ["connections/share.yaml", "user: REPLACE_ME", "user: corp\\ingest"],
  ],
  "private-sql-server": [
    ["project.yaml", "REPLACE_ME", "erplakedev"],
    ["project.yaml", "REPLACE_ME", "kv-erp-dev"],
    ["project.yaml", "REPLACE_ME", "erplakeprod"],
    ["project.yaml", "REPLACE_ME", "kv-erp-prod"],
    ["platform.yaml", "REPLACE_ME", "shir-erp"],
    ["connections/erp.yaml", "REPLACE_ME", "erp-sql01.corp.local"],
    ["connections/erp.yaml", "REPLACE_ME", "ingest_reader"],
    ["flows/erp.yaml", "REPLACE_ME.REPLACE_ME.", "erp.dbo."],
    ["flows/erp.yaml", "REPLACE_ME.REPLACE_ME.", "erp.dbo."],
  ],
};

function fill(): string {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-authoring-starters-"));
  cpSync(join(import.meta.dirname, "../../core/project-templates"), folder, {
    recursive: true,
    filter: (path) => !path.includes("/build"),
  });
  for (const [starter, written] of Object.entries(values))
    for (const [file, from, to] of written) {
      const path = join(folder, starter, file);
      writeFileSync(path, readFileSync(path, "utf8").replace(from, to));
    }
  return folder;
}

/** The folder holding every starter, each with its values written. */
export const filledTemplates = fill();

/** `text` with `from` replaced, failing when the starter no longer has `from`. */
export function replaced(text: string, from: string, to: string): string {
  if (!text.includes(from)) throw new Error(`The starter no longer has: ${from}`);
  return text.replace(from, to);
}

/** The retail flow with its orders table written with its store method's settings, no intent. */
export function ordersWithSettings(flow: string): string {
  return replaced(
    flow,
    "    history: latest\n    sequence: updated_at\n    load: { deletes: { when: \"op = 'D'\" } }\n    store:\n      with: { except_columns: [op] }\n",
    "    store:\n      with: { mode: upsert, sequence_by: updated_at, delete_when: \"op = 'D'\", except_columns: [op] }\n",
  );
}
