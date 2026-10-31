import { join } from "node:path";
import { defineKind, formatDiagnostics, loadProject } from "@ingestron/config";

const pipeline = defineKind({
  apiVersion: "example.dev/v1",
  kind: "Pipeline",
  schema: { type: "object", required: ["columns", "query"] },
});

const result = loadProject(join(import.meta.dirname, "definitions"), {
  kinds: [pipeline],
});
if (!result.ok) {
  console.error(formatDiagnostics(result.diagnostics));
  process.exit(1);
}

console.log(JSON.stringify(result.project.get(pipeline, "orders")?.value, null, 2));
