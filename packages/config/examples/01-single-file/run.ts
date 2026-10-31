import { join } from "node:path";
import { defineKind, formatDiagnostics, loadProject } from "@ingestron/config";

// The TypeScript shape of a valid Pipeline document.
interface Pipeline {
  apiVersion: string;
  kind: "Pipeline";
  id: string;
  table: string;
  schedule: "hourly" | "daily";
}

// The schema is what the loader actually checks.
const pipeline = defineKind<Pipeline>({
  apiVersion: "example.dev/v1",
  kind: "Pipeline",
  schema: {
    type: "object",
    required: ["apiVersion", "kind", "id", "table", "schedule"],
    properties: {
      table: { type: "string" },
      schedule: { enum: ["hourly", "daily"] },
    },
  },
});

const result = loadProject(join(import.meta.dirname, "definitions"), {
  kinds: [pipeline],
});
if (!result.ok) {
  console.error(formatDiagnostics(result.diagnostics));
  process.exit(1);
}

for (const document of result.project.all(pipeline)) {
  console.log(`${document.id}: ${document.value.table} (${document.value.schedule})`);
}
