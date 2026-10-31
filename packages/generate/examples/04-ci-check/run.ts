// A check for continuous integration: are the committed files up to date?
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyPlan, nodeFolder, planGeneration } from "@ingestron/generate";

const folder = nodeFolder(mkdtempSync(join(tmpdir(), "example-")));
applyPlan(folder, planGeneration(folder, { "orders.job.yml": "name: orders\n" }));

function check(wanted: Record<string, string>): void {
  const plan = planGeneration(folder, wanted);
  const stale = plan.changes.filter((change) => change.change !== "unchanged");
  console.log(
    plan.upToDate ? "up to date" : `stale: ${stale.map((change) => change.path).join(", ")}`,
  );
}

check({ "orders.job.yml": "name: orders\n" });
check({ "orders.job.yml": "name: orders\nmax_retries: 3\n", "shop.job.yml": "name: shop\n" });
