import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import {
  defineKind,
  formatDiagnostics,
  isSecretReference,
  loadProject,
  type JsonSchema,
  type SecretReference,
} from "@ingestron/config";

interface Connection {
  apiVersion: string;
  kind: "Connection";
  id: string;
  host: string;
  port: number;
  password: SecretReference;
}

interface Pipeline {
  apiVersion: string;
  kind: "Pipeline";
  id: string;
  table: string;
}

// Schemas live in their own YAML files, so editors and other languages can use them.
function readSchema(name: string): JsonSchema {
  return parse(readFileSync(join(import.meta.dirname, "schemas", name), "utf8")) as JsonSchema;
}

const connection = defineKind<Connection>({
  apiVersion: "example.dev/v1",
  kind: "Connection",
  schema: readSchema("connection.schema.yaml"),
});
const pipeline = defineKind<Pipeline>({
  apiVersion: "example.dev/v1",
  kind: "Pipeline",
  schema: readSchema("pipeline.schema.yaml"),
});

const result = loadProject(join(import.meta.dirname, "definitions"), {
  kinds: [connection, pipeline],
});
if (!result.ok) {
  console.error(formatDiagnostics(result.diagnostics));
  process.exit(1);
}

for (const { value } of result.project.all(connection)) {
  const password = isSecretReference(value.password) ? `secret "${value.password.$secret}"` : "?";
  console.log(`connection ${value.id}: ${value.host}:${value.port}, password from ${password}`);
}
for (const { value } of result.project.all(pipeline)) {
  console.log(`pipeline ${value.id}: ${value.table}`);
}
