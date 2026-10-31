// Someone edits a generated file by hand. Generation refuses to overwrite it.
import { appendFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyPlan, formatPlan, nodeFolder, planGeneration } from "@ingestron/generate";

const root = mkdtempSync(join(tmpdir(), "example-"));
const folder = nodeFolder(root);
applyPlan(folder, planGeneration(folder, { "orders.job.yml": "name: orders\n" }));

appendFileSync(join(root, "orders.job.yml"), "# tuned by hand\n");

const plan = planGeneration(folder, { "orders.job.yml": "name: orders\nmax_retries: 3\n" });
console.log(formatPlan(plan));

const result = applyPlan(folder, plan);
console.log(`\napplied: ${result.ok}`);
console.log(result.problems.map((problem) => `${problem.code}: ${problem.message}`).join("\n"));
