// Builds the retail example's bundle for dev and lists its files.
import { join } from "node:path";
import { loadDefinitions } from "@ingestron/definitions";
import { databricks } from "@ingestron/pack-databricks";

const folder = join(import.meta.dirname, "../../../../samples/starters/retail");
const result = loadDefinitions(folder, { packs: [databricks], environment: "dev" });
if (result.model) {
  for (const path of Object.keys(databricks.build(result.model))) console.log(path);
}
