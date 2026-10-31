// Generates a Databricks bundle resource file from the definitions.
import { join } from "node:path";
import { stringify } from "yaml";
import { defineKind, formatDiagnostics, loadProject } from "@ingestron/config";

interface Pipeline {
  apiVersion: string;
  kind: "Pipeline";
  id: string;
  table: string;
  job_name: string;
  cluster_id: string;
  notebook_params: Record<string, string>;
}

const pipeline = defineKind<Pipeline>({
  apiVersion: "example.dev/v1",
  kind: "Pipeline",
  schema: { type: "object", required: ["table", "job_name", "cluster_id"] },
});

const result = loadProject(join(import.meta.dirname, "definitions"), {
  kinds: [pipeline],
});
if (!result.ok) {
  console.error(formatDiagnostics(result.diagnostics));
  process.exit(1);
}

// Build the output as data and serialise it. Never paste values into YAML text.
const jobs = Object.fromEntries(
  result.project.all(pipeline).map(({ value }) => [
    value.id,
    {
      name: value.job_name,
      tasks: [
        {
          task_key: "load",
          existing_cluster_id: value.cluster_id,
          notebook_task: {
            notebook_path: "../notebooks/load.py",
            base_parameters: { table: value.table, ...value.notebook_params },
          },
        },
      ],
    },
  ]),
);

console.log(stringify({ resources: { jobs } }).trimEnd());
