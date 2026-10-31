// Writes editor schemas next to the definitions. Run it whenever a kind's
// schema changes, and commit the output.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineKind, manifestSchema, toEditorSchema, type JsonSchema } from "@ingestron/config";

const pipeline = defineKind({
  apiVersion: "example.dev/v1",
  kind: "Pipeline",
  schema: {
    type: "object",
    required: ["apiVersion", "kind", "id", "table"],
    properties: {
      apiVersion: { const: "example.dev/v1" },
      kind: { const: "Pipeline" },
      id: { type: "string" },
      table: { type: "string", description: "Target table name." },
      workers: { type: "integer", minimum: 1 },
      job_name: { type: "string" },
    },
  },
});

function writeSchema(name: string, schema: JsonSchema): void {
  const path = join(import.meta.dirname, "schemas", name);
  writeFileSync(path, JSON.stringify(schema, null, 2) + "\n");
  console.log(`wrote schemas/${name}`);
}

// The manifest is read literally, so its schema is used as it is.
writeSchema("project.editor.json", manifestSchema);
writeSchema("pipeline.editor.json", toEditorSchema(pipeline.schema));
