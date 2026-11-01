// Select definitions from tested examples; native generation stays in the packs.
import { join } from "node:path";
import { recipesFolder } from "@ingestron/pack-adf";
import { parse, stringify } from "yaml";
import { scaffoldFiles, type Content } from "./scaffold.js";
import { builtInFolder, readTemplate, type Template } from "./templates.js";
import { projectRoutes, projectSources, routeAliases } from "./project-choices.js";
import { projectQuestions } from "./project-questions.js";
const directExamples: Record<string, string> = {
  files: "minimal",
  sqlserver: "sql-server",
  salesforce: "salesforce",
  kafka: "kafka",
};
interface Definition {
  kind?: string;
  id?: string;
  connector?: string;
  connectivity?: string;
  source?: string;
  settings?: Record<string, Record<string, unknown>>;
  ingest?: { uses?: string; with?: Record<string, unknown>; settings?: Record<string, unknown> };
}
/** One composed project before answers are applied or files written.
 * @example const recipe: ProjectRecipe = projectRecipe("files", "databricks", "public");
 */
export interface ProjectRecipe {
  template: Template;
  files: Record<string, Content>;
}
/** Select a tested source recipe and expose its values through the normal init questions.
 * @example const recipe = projectRecipe("postgresql", "adf-databricks", "private");
 */
export function projectRecipe(connector: string, via: string, connectivity: string): ProjectRecipe {
  return recipe(connector, routeAliases[via] ?? via, connectivity);
}
function recipe(connector: string, via: string, connectivity: string): ProjectRecipe {
  const route = projectRoutes(connector, connectivity).find((item) => item.via === via);
  if (!route)
    throw new Error(`No ${via} route for ${connector} with ${connectivity} connectivity.`);
  const template = recipeTemplate(connector, via);
  const files = scaffoldFiles(template, {
    name: "example",
    environments: ["dev", "prod"],
    values: {},
  });
  delete files["sample.yaml"];
  const selected = selectSource(files, connector, connectivity, route.method);
  trimSettings(files, route.method, via, selected.flows);
  template.name = `${connector} via ${via}`;
  template.title = `${projectSources().find((source) => source.id === connector)!.title}: ${route.title}`;
  template.questions = projectQuestions(files, selected.connection, selected.flows, route.method);
  return { template, files };
}
function recipeTemplate(connector: string, via: string): Template {
  if (!via.startsWith("adf")) {
    const example = directExamples[connector];
    if (!example) throw new Error(`No tested project recipe for ${connector} via Databricks.`);
    return readTemplate(join(builtInFolder, example), example);
  }
  const folder = recipesFolder;
  return {
    name: connector,
    title: connector,
    summary: "ADF ingestion into Databricks",
    folder,
    questions: [],
  };
}
function selectSource(
  files: Record<string, Content>,
  connector: string,
  connectivity: string,
  method: string,
) {
  const definitions = Object.entries(files)
    .filter(([path]) => /\.ya?ml$/.test(path))
    .map(([path, text]) => ({ path, value: parse(String(text)) as Definition }));
  const selected = definitions.find(
    ({ value }) => value?.kind === "Connection" && value.connector === connector,
  );
  if (!selected) throw new Error(`The project recipe has no ${connector} connection.`);
  selected.value.connectivity = connectivity;
  const flows: string[] = [];
  for (const { path, value } of definitions) {
    if (value?.kind === "Connection" && path !== selected.path) delete files[path];
    if (value?.kind !== "Flow") continue;
    if (value.source !== selected.value.id) {
      delete files[path];
      continue;
    }
    flows.push(path);
    value.ingest = { ...value.ingest, uses: method };
    if (value.ingest.with) delete value.ingest.with.resource_names;
    files[path] = stringify(value);
  }
  files[selected.path] = stringify(selected.value);
  return { connection: selected.path, flows };
}
function trimSettings(
  files: Record<string, Content>,
  method: string,
  via: string,
  flowFiles: string[],
): void {
  const windowed = flowFiles.some((file) =>
    /mode: incremental|date_filter_column/.test(String(files[file])),
  );
  trimStandard(files, method, via, windowed);
  if (!files["platform.yaml"]) return;
  const platform = parse(String(files["platform.yaml"])) as Definition;
  if (platform.settings) platform.settings = { [method]: platform.settings[method] ?? {} };
  const settings = platform.settings?.[method];
  if (settings) delete settings.resource_names;
  if (settings) moveInfrastructure(files, flowFiles, settings);
  if (platform.settings && settings) Object.assign(platform.settings, destination(via, settings));
  files["platform.yaml"] = stringify(platform);
}

/** Each route's packs, the pack that names and types the tables first, and its store choice. */
const routeStandards: Record<string, { packs: string[]; store?: string }> = {
  databricks: { packs: ["databricks@1"] },
  "adf-databricks": { packs: ["databricks@1", "adf@1"] },
  "adf-synapse": { packs: ["synapse@1", "adf@1"], store: "synapse-view" },
  "adf-duckdb": { packs: ["duckdb@1", "adf@1"] },
  "adf-files": { packs: ["adf@1"], store: "none" },
};

function trimStandard(
  files: Record<string, Content>,
  method: string,
  via: string,
  windowed: boolean,
): void {
  const standard = parse(String(files["standard.yaml"])) as Definition & {
    packs: string[];
    store?: Record<string, unknown>;
  };
  const route = routeStandards[via] ?? routeStandards.databricks!;
  standard.packs = route.packs;
  if (route.store) standard.store = { ...standard.store, default: route.store };
  if (standard.ingest?.settings)
    standard.ingest.settings = { [method]: standard.ingest.settings[method] ?? {} };
  if (snapshot(via, windowed))
    standard.ingest = {
      ...standard.ingest,
      settings: {
        [method]: {
          ...(standard.ingest?.settings?.[method] as Record<string, unknown> | undefined),
          layout: "snapshot",
        },
      },
    };
  files["standard.yaml"] = stringify(standard);
}

/** Views and DuckDB rebuilds read one file per table, unless a flow copies windows, which must all be kept. */
function snapshot(via: string, windowed: boolean): boolean {
  return (via === "adf-synapse" || via === "adf-duckdb") && !windowed;
}

function moveInfrastructure(
  files: Record<string, Content>,
  flowFiles: string[],
  settings: Record<string, unknown>,
): void {
  for (const file of flowFiles) {
    const flow = parse(String(files[file])) as Definition;
    const overrides = flow.ingest?.with;
    if (!overrides) continue;
    for (const key of ["landing", "integration_runtime"]) {
      if (overrides[key] === undefined) continue;
      settings[key] = overrides[key];
      delete overrides[key];
    }
    files[file] = stringify(flow);
  }
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
