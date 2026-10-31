import { join } from "node:path";
import { defineKind, formatDiagnostics, loadProject } from "@ingestron/config";

interface Pipeline {
  apiVersion: string;
  kind: "Pipeline";
  id: string;
  catalog: string;
  table: string;
  cluster: { workers: number; node_type: string };
}

const pipeline = defineKind<Pipeline>({
  apiVersion: "example.dev/v1",
  kind: "Pipeline",
  schema: { type: "object", required: ["catalog", "table", "cluster"] },
});

for (const environment of ["dev", "prod"]) {
  const result = loadProject(join(import.meta.dirname, "definitions"), {
    kinds: [pipeline],
    environment,
  });
  if (!result.ok) {
    console.error(formatDiagnostics(result.diagnostics));
    process.exit(1);
  }
  const orders = result.project.get(pipeline, "orders")!.value;
  console.log(
    `${environment}: ${orders.catalog}.${orders.table}, ` +
      `${orders.cluster.workers} x ${orders.cluster.node_type}`,
  );
}
