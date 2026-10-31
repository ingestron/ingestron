// Plans and applies a first generation into an empty folder.
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyPlan, formatPlan, nodeFolder, planGeneration } from "@ingestron/generate";

const root = mkdtempSync(join(tmpdir(), "example-"));
const folder = nodeFolder(root);

const plan = planGeneration(folder, {
  "databricks.yml": "bundle:\n  name: retail\n",
  "resources/orders.job.yml": "resources:\n  jobs:\n    orders: {}\n",
});
console.log(formatPlan(plan));

const result = applyPlan(folder, plan);
console.log(`\napplied: ${result.ok}`);
console.log(`folder: ${readdirSync(root).sort().join(", ")}`);
