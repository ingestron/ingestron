// Generates twice: the second run updates one file and deletes another.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyPlan, formatPlan, nodeFolder, planGeneration } from "@ingestron/generate";

const folder = nodeFolder(mkdtempSync(join(tmpdir(), "example-")));

const first = {
  "databricks.yml": "bundle:\n  name: retail\n",
  "resources/orders.job.yml": "name: orders\nmax_retries: 1\ntimeout: 3600\n",
  "resources/legacy.job.yml": "name: legacy\n",
};
applyPlan(folder, planGeneration(folder, first));

const second = {
  "databricks.yml": "bundle:\n  name: retail\n",
  "resources/orders.job.yml": "name: orders\nmax_retries: 3\ntimeout: 3600\n",
};
console.log(formatPlan(planGeneration(folder, second), { diffs: true }));
