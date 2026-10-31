import { join } from "node:path";
import { defineKind, formatDiagnostics, loadProject } from "@ingestron/config";

interface Connection {
  apiVersion: string;
  kind: "Connection";
  id: string;
  host: string;
}

interface Pipeline {
  apiVersion: string;
  kind: "Pipeline";
  id: string;
  source: string;
  after?: string[];
}

const connection = defineKind<Connection>({
  apiVersion: "example.dev/v1",
  kind: "Connection",
  schema: { type: "object", required: ["host"] },
});

const pipeline = defineKind<Pipeline>({
  apiVersion: "example.dev/v1",
  kind: "Pipeline",
  schema: { type: "object", required: ["source"] },
  // Each key is a JSON Pointer into a Pipeline; `*` matches every list item.
  links: {
    "/source": "Connection",
    "/after/*": "Pipeline",
  },
});

const result = loadProject(join(import.meta.dirname, "definitions"), {
  kinds: [connection, pipeline],
});
if (!result.ok) {
  console.error(formatDiagnostics(result.diagnostics));
  process.exit(1);
}

// Links were checked during the load, so these lookups cannot miss.
for (const { value } of result.project.all(pipeline)) {
  const source = result.project.get(connection, value.source)!.value;
  const after = value.after?.length ? `, after ${value.after.join(", ")}` : "";
  console.log(`${value.id} reads from ${source.host}${after}`);
}
