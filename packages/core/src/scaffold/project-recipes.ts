// Select definitions from tested examples; native generation stays in the packs.
import { join } from "node:path";
import { recipesFolder } from "@ingestron/pack-adf";
import { parse } from "yaml";
import { deleteIfThere, editYaml } from "./init-yaml.js";
import { routeStandards, trimSettings } from "./recipe-trim.js";
import { scaffoldFiles, type Content } from "./scaffold.js";
import { builtInFolder, readTemplate, type Template } from "./templates.js";
import { projectRoutes, projectSources, routeAliases } from "./project-choices.js";
import type { RecipeFacts } from "./init-compose.js";
import { packs } from "../packs/index.js";
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
  tables?: Record<string, { contract?: string }>;
  contract?: string;
}
/** One composed project before answers are applied or files written.
 * @example const recipe: ProjectRecipe = projectRecipe("files", "databricks", "public");
 * @public
 */
export interface ProjectRecipe {
  template: Template;
  files: Record<string, Content>;
}
/** Select a tested source recipe: its files as the example writes them, before `init` writes
 * REPLACE_ME, the defaults and the secret names. Its template asks no questions.
 * @example const recipe = projectRecipe("postgresql", "adf-databricks", "private");
 * @public
 */
export function projectRecipe(connector: string, via: string, connectivity: string): ProjectRecipe {
  const { template, files } = composableRecipe(connector, via, connectivity);
  return { template, files };
}

/**
 * The recipe, with what `init` needs to compose it.
 * @internal
 */
export function composableRecipe(
  connector: string,
  given: string,
  connectivity: string,
): ProjectRecipe & { facts: RecipeFacts } {
  const via = routeAliases[given] ?? given;
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
  template.questions = [];
  const standard = routeStandards[via] ?? routeStandards.databricks!;
  if (standard.summary) template.summary = standard.summary;
  const facts: RecipeFacts = {
    connection: selected.connection,
    flows: selected.flows,
    route: { method: route.method, packs: standard.packs, packsComment: standard.comment },
    connector: packs
      .flatMap((pack) => pack.connectors ?? [])
      .find((item) => item.id === connector && item.method === route.method),
  };
  return { template, files, facts };
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
  // Edited as documents, so the example's comments stay.
  editYaml(files, selected.path, (document) => document.set("connectivity", connectivity));
  const flows: string[] = [];
  for (const { path, value } of definitions) {
    if (value?.kind === "Connection" && path !== selected.path) delete files[path];
    if (value?.kind !== "Flow") continue;
    if (value.source !== selected.value.id) {
      delete files[path];
      continue;
    }
    flows.push(path);
    editYaml(files, path, (document) => {
      document.setIn(["ingest", "uses"], method);
      deleteIfThere(document, ["ingest", "with", "resource_names"]);
    });
  }
  dropUnusedContracts(files, definitions, flows);
  return { connection: selected.path, flows };
}
/** Contracts that only the dropped flows used go with them; a transform's own contract stays. */
function dropUnusedContracts(
  files: Record<string, Content>,
  definitions: { path: string; value: Definition }[],
  flows: string[],
): void {
  const used = new Set([
    ...definitions
      .filter(({ path }) => flows.includes(path))
      .flatMap(({ value }) => Object.values(value.tables ?? {}))
      .map((table) => table.contract),
    ...definitions
      .filter(({ path, value }) => value?.kind === "Transform" && path in files)
      .map(({ value }) => value.contract),
  ]);
  for (const { path, value } of definitions)
    if (value?.kind === "DataContract" && !used.has(value.id)) delete files[path];
}
