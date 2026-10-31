// Builds the ADF resources of example 12 for prod and lists them.
import { join } from "node:path";
import { loadDefinitions } from "@ingestron/definitions";
import { adf } from "@ingestron/pack-adf";
import { databricks } from "@ingestron/pack-databricks";

const folder = join(import.meta.dirname, "../../../../samples/starters/private-sql-server");
const result = loadDefinitions(folder, { packs: [databricks, adf], environment: "prod" });
if (result.model) {
  for (const path of Object.keys(adf.build(result.model))) console.log(path);
}
