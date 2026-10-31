// The entry point: load a project and resolve it for one environment.
import {
  loadProject,
  nodeFiles,
  resolveProject,
  type AnyDiagnostic,
  type FileSource,
} from "@ingestron/config";
import { checkGrants } from "./capabilities.js";
import { checkContractFields } from "./contract-use.js";
import { checkSettingsKeys } from "./settings-keys.js";
import { createContext, type Context } from "./context.js";
import { createReporter, type Source } from "./diagnostics.js";
import { kinds } from "./documents.js";
import { flowTables } from "./flows.js";
import { placeholderWarnings } from "./placeholders.js";
import type { ResolvedModel, ResolvedTable } from "./model.js";
import { renderName } from "./naming.js";
import type { PackInfo } from "./pack.js";
import { resolvePlatform } from "./platform.js";
import { checkDuplicateNames, createNamer, type TableNamer } from "./tables.js";
import { transformTables } from "./transforms.js";

/** Options for {@link resolveDefinitions} and {@link loadDefinitions}. */
export interface ResolveOptions {
  /** The packs available; the project's standard chooses which to use. */
  packs: PackInfo[];
  /** The environment to resolve for, declared in project.yaml. */
  environment?: string;
  /** Environment variables for `${envvar:…}`. */
  envvars?: Readonly<Record<string, string | undefined>>;
}

/** The model when there are no errors, and every diagnostic. */
export interface ResolveResult {
  ok: boolean;
  model?: ResolvedModel;
  diagnostics: AnyDiagnostic[];
}

const allKinds = Object.values(kinds);

/**
 * Loads definitions from any file source and resolves them with the packs its standard names.
 * @example
 * const result = resolveDefinitions(memoryFiles(files), { packs: [databricks], environment: "dev" });
 */
export function resolveDefinitions(files: FileSource, options: ResolveOptions): ResolveResult {
  const loaded = resolveProject(files, {
    kinds: allKinds,
    environment: options.environment,
    envvars: options.envvars ?? {},
  });
  return withPlaceholders(
    files,
    loaded.ok
      ? resolveLoaded(loaded.project, options.packs, loaded.diagnostics)
      : { ok: false, diagnostics: loaded.diagnostics },
    documentFiles(files, loaded.project?.documents),
  );
}

/** The documents' files; every YAML file outside build/ when the project did not load. */
function documentFiles(files: FileSource, documents?: readonly { file: string }[]): string[] {
  if (documents) return documents.map((document) => document.file);
  return files.list().filter((path) => /\.ya?ml$/.test(path) && !path.startsWith("build/"));
}

/** The result with a warning for each `{{ … }}` that stays as written. */
function withPlaceholders(
  files: FileSource,
  result: ResolveResult,
  documents: string[],
): ResolveResult {
  const warnings = placeholderWarnings(files, documents);
  return warnings.length > 0
    ? { ...result, diagnostics: [...result.diagnostics, ...warnings] }
    : result;
}

/**
 * Loads definitions from a folder on disk and resolves them with the packs its standard names.
 * @example
 * const result = loadDefinitions("definitions", { packs: [databricks, adf], environment: "prod" });
 */
export function loadDefinitions(folder: string, options: ResolveOptions): ResolveResult {
  const loaded = loadProject(folder, {
    kinds: allKinds,
    environment: options.environment,
    envvars: options.envvars,
  });
  return withPlaceholders(
    nodeFiles(folder),
    loaded.ok
      ? resolveLoaded(loaded.project, options.packs, loaded.diagnostics)
      : { ok: false, diagnostics: loaded.diagnostics },
    documentFiles(nodeFiles(folder), loaded.project?.documents),
  );
}

function resolveLoaded(
  project: Parameters<typeof createContext>[0],
  packs: PackInfo[],
  warnings: ResolveResult["diagnostics"],
): ResolveResult {
  // Loading succeeded, so what it reported are warnings, kept with the result.
  const reporter = createReporter(warnings);
  const context = createContext(project, packs, reporter);
  if (!context) return { ok: false, diagnostics: reporter.diagnostics };
  checkSettingsKeys(context);
  checkGrants(context);
  const namer = createNamer(context);
  const flows = flowTables(context, namer);
  const tables = [...flows, ...transformTables(context, namer, flows)];
  checkDuplicateNames(context, tables, (table) => originOf(context, table));
  recordOutputs(context, tables);
  runMethodChecks(context, tables);
  checkContractFields(context, new Set(tables.map((table) => table.contract.id)));
  // Project-wide checks only make sense once every table resolved.
  const model = reporter.failed() ? undefined : buildModel(context, namer, tables);
  if (model) runPackCheck(context, model);
  return model && !reporter.failed()
    ? { ok: true, model, diagnostics: reporter.diagnostics }
    : { ok: false, diagnostics: reporter.diagnostics };
}

/** The model, once the project-wide names render; undefined after reporting. */
function buildModel(
  context: Context,
  namer: TableNamer,
  tables: ResolvedTable[],
): ResolvedModel | undefined {
  const { project } = context;
  const base = { project: project.id, environment: context.environment };
  const pipeline = renderName(context, namer.patterns.pipeline, base);
  const job = renderName(context, namer.patterns.job, base);
  if (!pipeline || !job) return undefined;
  return {
    project: {
      id: project.id,
      ...(project.name && { name: project.name }),
      environment: context.environment,
    },
    standard: { id: context.standard.value.id, packs: context.standard.value.packs },
    platform: resolvePlatform(context),
    layers: namer.layers,
    names: { pipeline, job },
    tables,
  };
}

/** Each pack's checks on the whole model (`PACK_CHECK`), reported at the platform. */
function runPackCheck(context: Context, model: ResolvedModel): void {
  const at = context.platform && { document: context.platform, pointer: "" };
  for (const message of context.packs.flatMap((pack) => pack.check?.(model) ?? []))
    context.reporter.error("PACK_CHECK", `${message}.`, at);
}

/** Records where each step's data lands, when its method says (`output`). */
function recordOutputs(context: Context, tables: ResolvedTable[]): void {
  for (const table of tables) {
    for (const step of [table.ingest, table.transform, table.store]) {
      const output = step && context.pack.methods[step.method]?.output?.(table);
      if (step && output) step.output = output;
    }
  }
}

/** Runs each chosen method's own check on its table (`METHOD_CHECK`). */
function runMethodChecks(context: Context, tables: ResolvedTable[]): void {
  for (const table of tables) {
    for (const step of [table.ingest, table.transform, table.store]) {
      const method = step && context.pack.methods[step.method];
      for (const message of method?.check?.(table) ?? []) {
        context.reporter.error(
          "METHOD_CHECK",
          `"${step?.method}" for table "${table.name}": ${message}.`,
          originOf(context, table),
        );
      }
    }
  }
}

/** Where a table was defined: its key in a flow, or a transform's id. */
function originOf(context: Context, table: ResolvedTable): Source | undefined {
  if (table.origin.kind === "Flow") {
    const flow = context.project.get(kinds.flow, table.origin.id);
    return flow && { document: flow, pointer: `/tables/${table.name}` };
  }
  const transform = context.project.get(kinds.transform, table.origin.id);
  return transform && { document: transform, pointer: "/id" };
}
