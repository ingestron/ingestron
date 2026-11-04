// The entry point: load a project and resolve it for one environment.
import {
  loadProject,
  nodeFiles,
  resolveProject,
  type AnyDiagnostic,
  type FileSource,
} from "@ingestron/config";
import { checkRunsOn } from "./runs-on.js";
import { checkGrants } from "./capabilities.js";
import { checkContractFields } from "./contract-use.js";
import { checkSettingsKeys } from "./settings-keys.js";
import { createContext, type Context } from "./context.js";
import type { Source } from "./diagnostics.js";
import { checkDeployValues, deployValuesOf, resolutionReporter } from "./deploy-values.js";
import { kinds } from "./documents.js";
import { flowTables } from "./flows.js";
import { placeholderWarnings } from "./placeholders.js";
import { checkGovernance } from "./governance.js";
import { resolveProducts } from "./products.js";
import { runsOnProblems } from "./runs-on-pack.js";
import type { ResolvedModel, ResolvedProduct, ResolvedTable } from "./model.js";
import { renderName } from "./naming.js";
import type { PackInfo } from "./pack.js";
import { resolvePlatform } from "./platform.js";
import { checkDuplicateNames, createNamer, type TableNamer } from "./tables.js";
import { transformTables } from "./transforms.js";
import { holdsUnsetEnvvar } from "./unknown-values.js";
import { recordOutputs, runPackCheck } from "./pack-checks.js";

/** Options for {@link resolveDefinitions} and {@link loadDefinitions}. */
export interface ResolveOptions {
  /** The packs available; the project's standard chooses which to use. */
  packs: PackInfo[];
  /** The environment to resolve for, declared in project.yaml. */
  environment?: string;
  /** Environment variables for `${envvar:…}`. */
  envvars?: Readonly<Record<string, string | undefined>>;
  /**
   * What a `${envvar:…}` that is set nowhere is: an error (the default), or
   * information that leaves the project loading, for an editor.
   */
  missingEnvvars?: "error" | "information";
  /**
   * True for the packs that build environments together: every `${envvar:…}` is a
   * deploy-time value, which the pipeline that deploys the files supplies. It is never read
   * from the host environment or an environment file, and the model lists each in
   * `deployValues` (specification section 1.1). `envvars` and `missingEnvvars` are not used.
   */
  deployTime?: boolean;
  /**
   * True when every environment is generated together, as the CLI from 2.0 does: `mode`
   * is then `production` by default for every environment except `dev` (and `default`).
   * Without it, `mode` defaults as before 1.8 (specification section 7).
   */
  environmentsTogether?: boolean;
}

/** The model when there are no errors, and every diagnostic. */
export interface ResolveResult {
  ok: boolean;
  model?: ResolvedModel;
  diagnostics: AnyDiagnostic[];
}

const allKinds = Object.values(kinds);

/** What the loader is given, from the resolve options. */
function loadOptions(options: ResolveOptions) {
  return {
    kinds: allKinds,
    environment: options.environment,
    envvars: options.envvars,
    ...(options.missingEnvvars && { missingEnvvars: options.missingEnvvars }),
    ...(options.deployTime && { deployEnvvars: true }),
  };
}

/**
 * Loads definitions from any file source and resolves them with the packs its standard names.
 * @example
 * const result = resolveDefinitions(memoryFiles(files), { packs: [databricks], environment: "dev" });
 */
export function resolveDefinitions(files: FileSource, options: ResolveOptions): ResolveResult {
  const loaded = resolveProject(files, { ...loadOptions(options), envvars: options.envvars ?? {} });
  return withPlaceholders(
    files,
    loaded.ok
      ? resolveLoaded(loaded.project, options, [
          ...loaded.diagnostics,
          ...runsOnProblems(files, loaded.project, options.packs),
        ])
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
  const loaded = loadProject(folder, loadOptions(options));
  return withPlaceholders(
    nodeFiles(folder),
    loaded.ok
      ? resolveLoaded(loaded.project, options, [
          ...loaded.diagnostics,
          ...runsOnProblems(nodeFiles(folder), loaded.project, options.packs),
        ])
      : { ok: false, diagnostics: loaded.diagnostics },
    documentFiles(nodeFiles(folder), loaded.project?.documents),
  );
}

function resolveLoaded(
  project: Parameters<typeof createContext>[0],
  options: ResolveOptions,
  warnings: ResolveResult["diagnostics"],
): ResolveResult {
  // Loading succeeded, so what it reported are warnings, kept with the result.
  // A value that holds an unset reference is not known yet, so no problem is reported at
  // it, except a settings failure: the settings check has already left out what it causes.
  const deployTime = options.deployTime === true;
  const reporter = resolutionReporter(project, warnings, deployTime);
  const context = createContext(project, options.packs, reporter);
  if (!context) return { ok: false, diagnostics: reporter.diagnostics };
  if (deployTime) checkDeployValues(context);
  checkSettingsKeys(context);
  checkGrants(context);
  const namer = createNamer(context);
  const flows = flowTables(context, namer);
  const tables = [...flows, ...transformTables(context, namer, flows)];
  checkDuplicateNames(context, tables, (table) => originOf(context, table));
  recordOutputs(context, tables);
  checkServeInputs(context, tables);
  checkRunsOn(context, tables, (table) => originOf(context, table));
  runMethodChecks(context, tables);
  checkContractFields(context, new Set(tables.map((table) => table.contract.id)));
  const products = resolveProducts(context, tables);
  checkGovernance(context, products);
  // Project-wide checks only make sense once every table resolved.
  const together = options.environmentsTogether === true;
  const built = reporter.failed()
    ? undefined
    : buildModel(context, namer, together, tables, products);
  const model = built && deployTime ? { ...built, deployValues: deployValuesOf(project) } : built;
  if (model) runPackCheck(context, model);
  return model && !reporter.failed()
    ? { ok: true, model, diagnostics: reporter.diagnostics }
    : { ok: false, diagnostics: reporter.diagnostics };
}

/** The model, once the project-wide names render; undefined after reporting. */
function buildModel(
  context: Context,
  namer: TableNamer,
  together: boolean,
  tables: ResolvedTable[],
  products: ResolvedProduct[],
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
    standard: {
      id: context.standard.value.id,
      packs: context.standard.value.packs,
      ...(context.standard.value.governance && { governance: context.standard.value.governance }),
    },
    platform: resolvePlatform(context, together),
    layers: namer.layers,
    names: { pipeline, job },
    tables,
    products,
  };
}

/** A serve method that reads where the data lands needs a last step that says where (`HANDOVER`). */
function checkServeInputs(context: Context, tables: ResolvedTable[]): void {
  for (const table of tables) {
    const serve = table.serve;
    const last = table.store ?? table.ingest;
    if (!serve || !last || last.output || !context.pack.methods[serve.method]?.needsOutput)
      continue;
    context.reporter.error(
      "HANDOVER",
      `The serve step "${serve.method}" reads where "${last.method}" puts its data, and "${last.method}" does not say.`,
      serveOrigin(context, table),
      "Serve it with a method that does not need to know where its data lands.",
    );
  }
}

/**
 * Runs each chosen method's own check on its table (`METHOD_CHECK`), except on a table
 * that holds an unset reference: what a check judges cannot be told apart.
 */
function runMethodChecks(context: Context, tables: ResolvedTable[]): void {
  for (const table of tables) {
    if (holdsUnsetEnvvar(context.project, table)) continue;
    for (const step of [table.ingest, table.transform, table.store, table.serve]) {
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

/** Where the serve step was chosen: the flow's or transform's serve.uses, else the table. */
function serveOrigin(context: Context, table: ResolvedTable): Source | undefined {
  const document =
    table.origin.kind === "Flow"
      ? context.project.get(kinds.flow, table.origin.id)
      : context.project.get(kinds.transform, table.origin.id);
  const uses = (document?.value as { serve?: { uses?: string } } | undefined)?.serve?.uses;
  return document && uses ? { document, pointer: "/serve/uses" } : originOf(context, table);
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
