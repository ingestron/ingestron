// Platform choices and source-free project scaffolds; provider recipes own their settings.
import { matchesImport } from "@ingestron/config/core";
import { parse, parseDocument } from "yaml";
import { composableRecipe } from "./project-recipes.js";
import { builtInFolder, readTemplate } from "./templates.js";
import { join } from "node:path";
import type { Source } from "./init-files.js";
import type { Content } from "./scaffold.js";

/** A target platform starter, before any source is added. @public */
export interface ProjectPlatform {
  id: string;
  title: string;
  summary: string;
}

/** Target platform starters available to CLI and editor project creation. @public */
export function projectPlatforms(): ProjectPlatform[] {
  return [
    {
      id: "synapse",
      title: "Azure Synapse",
      summary: "Workspace pipelines and serverless SQL views",
    },
    { id: "databricks", title: "Databricks", summary: "Direct ingestion and managed tables" },
    {
      id: "adf-landing",
      title: "Azure Data Factory",
      summary: "Copy source tables into landing storage",
    },
    { id: "duckdb", title: "DuckDB", summary: "Local tables and Parquet files" },
  ];
}

/** A tested target scaffold, with no source definitions or samples. @internal */
export function platformSource(id: string): Source {
  const platform = projectPlatforms().find((item) => item.id === id);
  if (!platform)
    throw new Error(
      `Unknown platform "${id}". Choose ${projectPlatforms()
        .map((item) => item.id)
        .join(", ")}.`,
    );
  const source =
    id === "duckdb"
      ? { template: readTemplate(join(builtInFolder, "duckdb"), "duckdb") }
      : composableRecipe(id === "databricks" ? "files" : "azure-sql-database", id, "public");
  if (id === "databricks" && "files" in source) {
    source.files["platform.yaml"] =
      "apiVersion: ingestron.io/v1\nkind: Platform\nid: target\ndatabricks:\n  workspace:\n    host: REPLACE_ME\n    root_path: /Workspace/Shared/ingestron\n";
    const project = parseDocument(String(source.files["project.yaml"]));
    const imports = (project.toJSON() as { imports: string[] }).imports;
    project.set("imports", [...imports, "platform.yaml"]);
    source.files["project.yaml"] = project.toString();
  }
  return {
    ...source,
    template: { ...source.template, name: id, title: platform.title, summary: platform.summary },
    empty: true,
    done: () => undefined,
  };
}

const exampleKinds = new Set([
  "Connection",
  "Flow",
  "DataContract",
  "Transform",
  "Product",
  "DataProduct",
  "SourceMetadata",
]);

/**
 * Remove worked source definitions, retaining the target and standard, including imported policy
 * files. A pattern no remaining file matches is left out of imports (spec/cli/projects.md): the
 * section's first file adds it back.
 */
export function withoutExample(files: Record<string, Content>): void {
  const removed = new Set<string>();
  for (const [path, content] of Object.entries(files)) {
    const example = /^(?:samples?|data)\//.test(path);
    const kind = /\.ya?ml$/.test(path)
      ? (parse(String(content)) as { kind?: string } | null)?.kind
      : undefined;
    if (!example && !exampleKinds.has(kind ?? "")) continue;
    removed.add(path);
    delete files[path];
  }
  const project = parseDocument(String(files["project.yaml"]));
  const imports = (project.toJSON() as { imports?: string[] }).imports;
  if (imports)
    project.set(
      "imports",
      imports.filter(
        (path) =>
          !removed.has(path) &&
          (!/[*?[{]/.test(path) || Object.keys(files).some((file) => matchesImport(path, file))),
      ),
    );
  files["project.yaml"] = project.toString({ lineWidth: 0 });
}
