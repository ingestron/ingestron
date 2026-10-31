import { join } from "node:path";
import { defineKind, formatDiagnostics, loadProject } from "@ingestron/config";

const pipeline = defineKind({
  apiVersion: "example.dev/v1",
  kind: "Pipeline",
  schema: {
    type: "object",
    properties: { workers: { type: "integer" } },
  },
});

const result = loadProject(join(import.meta.dirname, "definitions"), {
  kinds: [pipeline],
});

// Every problem is reported in one pass, each with a location and a fix.
console.log(`ok: ${result.ok}`);
console.log(formatDiagnostics(result.diagnostics));
