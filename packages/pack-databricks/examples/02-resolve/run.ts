// Resolves the retail example for prod and prints each table's choices.
import { join } from "node:path";
import { fullNameText, loadDefinitions } from "@ingestron/definitions";
import { databricks } from "@ingestron/pack-databricks";

const folder = join(import.meta.dirname, "../../../../samples/starters/retail");
const result = loadDefinitions(folder, { packs: [databricks], environment: "prod" });
for (const table of result.model?.tables ?? []) {
  const first = table.ingest?.method ?? table.transform?.method;
  console.log(
    `${fullNameText(table.fullName)}: ${first} → ${table.store?.method} (${String(table.store?.settings.mode ?? "view")})`,
  );
}
console.log(`pipeline ${result.model?.names.pipeline}, mode ${result.model?.platform.mode}`);
