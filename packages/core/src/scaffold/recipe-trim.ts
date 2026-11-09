// A recipe trimmed to its route: the standard's packs and store, only the route's method
// settings, and the landing storage the destination reads (spec/cli/projects.md).
import { isMap, isScalar } from "yaml";
import { deleteIfThere, editYaml, setWithComment, type YamlDocument } from "./init-yaml.js";
import type { Content } from "./scaffold.js";

/** Trims the standard and the platform to the route's method, as documents. */
export function trimSettings(
  files: Record<string, Content>,
  method: string,
  via: string,
  flowFiles: string[],
): void {
  const windowed = flowFiles.some((file) =>
    /mode: incremental|date_filter_column/.test(String(files[file])),
  );
  trimStandard(files, method, via, windowed);
  editYaml(files, "platform.yaml", (platform) => {
    if (!isMap(platform.get("settings"))) return;
    onlyMethod(platform, ["settings"], method);
    deleteIfThere(platform, ["settings", method, "resource_names"]);
    moveInfrastructure(files, flowFiles, platform, method);
    const settings = platform.getIn(["settings", method]);
    const landing = isMap(settings) ? settings.get("landing") : undefined;
    for (const [key, value] of Object.entries(destination(via, { landing })))
      platform.setIn(["settings", key], value);
  });
}

/** Keeps only the method's entry of the mapping at `keys`, with the comments of what stays. */
function onlyMethod(document: YamlDocument, keys: string[], method: string): void {
  const settings = document.getIn(keys);
  if (!isMap(settings)) return;
  for (const pair of [...settings.items]) {
    const key = isScalar(pair.key) ? pair.key.value : pair.key;
    if (key !== method) settings.delete(pair.key);
  }
  if (!settings.has(method)) document.setIn([...keys, method], {});
}

/** Each route's packs, the pack that names and types the tables first, and its store choice. */
export const routeStandards: Record<
  string,
  { packs: string[]; comment: string; store?: string; summary?: string }
> = {
  databricks: { packs: ["databricks@2"], comment: "Databricks reads, names and stores the tables" },
  "adf-databricks": {
    summary:
      "Data Factory copies the source's tables into landing storage, and Databricks keeps them as tables.",
    packs: ["databricks@2", "adf@2"],
    comment: "Databricks names and stores the tables; ADF only copies them",
  },
  "adf-synapse": {
    summary:
      "Data Factory copies the source's tables into landing storage, and Synapse serverless SQL serves them as views.",
    packs: ["synapse@2", "adf@2"],
    comment: "Synapse serves the landed files as views; ADF copies them",
    store: "synapse-view",
  },
  "adf-duckdb": {
    summary:
      "Data Factory copies the source's tables into landing storage, and DuckDB builds tables from them and publishes Parquet.",
    packs: ["duckdb@2", "adf@2"],
    comment: "DuckDB builds tables from the landed files; ADF copies them",
  },
  "adf-landing": {
    summary: "Data Factory copies the source's tables into landing storage, where the flows end.",
    packs: ["adf@2"],
    comment: "ADF copies the tables; the flows end at the landed files",
    store: "none",
  },
};

function trimStandard(
  files: Record<string, Content>,
  method: string,
  via: string,
  windowed: boolean,
): void {
  const route = routeStandards[via] ?? routeStandards.databricks!;
  editYaml(files, "standard.yaml", (standard) => {
    standard.set("packs", standard.createNode(route.packs, { flow: true }));
    if (route.store) standard.setIn(["store", "default"], route.store);
    onlyMethod(standard, ["ingest", "settings"], method);
    if (snapshot(via, windowed))
      setWithComment(
        standard,
        ["ingest", "settings", method, "layout"],
        "snapshot",
        "One file per table, replaced by each copy: the files the route's tables or views read",
      );
  });
}

/** Views and DuckDB rebuilds read one file per table, unless a flow copies windows, which must all be kept. */
function snapshot(via: string, windowed: boolean): boolean {
  return (via === "adf-synapse" || via === "adf-duckdb") && !windowed;
}

/** A flow's own landing and runtime move to the platform's method settings. */
function moveInfrastructure(
  files: Record<string, Content>,
  flowFiles: string[],
  platform: YamlDocument,
  method: string,
): void {
  for (const file of flowFiles)
    editYaml(files, file, (flow) => {
      for (const key of ["landing", "integration_runtime"]) {
        const value = flow.getIn(["ingest", "with", key]);
        if (value === undefined) continue;
        platform.setIn(["settings", method, key], value);
        flow.deleteIn(["ingest", "with", key]);
      }
    });
}

/** The platform settings a route's destination needs, beside ADF's landing storage. */
function destination(via: string, adf: Record<string, unknown>): Record<string, unknown> {
  const root = /^abfss:\/\/[^@/]+@[^/]+/.exec(String(adf.landing ?? ""))?.[0];
  if (!root) return {};
  if (via === "adf-synapse")
    return { "synapse-view": { data_source: "landing", data_source_location: root } };
  if (via === "adf-duckdb")
    return {
      "duckdb-table": { published: root.replace(/^abfss:\/\/[^@]+@/, "abfss://published@") },
    };
  return {};
}
