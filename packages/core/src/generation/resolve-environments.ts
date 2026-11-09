// Every environment resolved before anything is planned (spec/cli/outputs.md,
// section 1): for deploy, for the packs that build environments together, and
// with the host's values, for every other pack and every local environment.
import { resolveProject, type AnyDiagnostic, type FileSource } from "@ingestron/config";
import {
  kinds,
  resolveDefinitions,
  type Pack,
  type ResolvedModel,
  type ResolveResult,
} from "@ingestron/definitions";
import { projectEnvironments, type DeclaredEnvironment } from "./environments.js";

/** One environment, resolved. */
export interface ResolvedEnvironment {
  /** The environment's name, `default` when project.yaml declares none. */
  name: string;
  /** The model the passports use and the targets come from. */
  model: ResolvedModel;
  /** Resolved for deploy, for the packs that build environments together; absent for a local environment. */
  deploy?: ResolvedModel;
  /** Resolved with the host's values, for every other pack; absent when no such pack needs it. */
  host?: ResolvedModel;
}

/**
 * What resolving one environment, or building one pack's files, found, to print before anything is planned.
 * @public
 */
export interface Report {
  /** The environment's name, `default` when project.yaml declares none, or the pack's id. */
  name: string;
  /** Whether it failed: an environment that did not resolve, or a pack that reported an error. */
  failed: boolean;
  /** The problems and warnings it found, each once. */
  diagnostics: AnyDiagnostic[];
}

/** Every environment, and the reports; `ok` when none has problems. */
export interface Resolution {
  environments: ResolvedEnvironment[];
  reports: Report[];
  ok: boolean;
  /** Whether the standard names a pack that builds environments together. */
  together: boolean;
  /** The environments resolved with the host's values only, known before resolving. */
  local: string[];
}

/** Resolves every environment project.yaml declares, as `plan` does; `check` makes REPLACE_ME an error. */
export function resolveEnvironments(
  files: FileSource,
  available: readonly Pack[],
  envvars: Readonly<Record<string, string | undefined>>,
  replaceMe: "warning" | "error" = "warning",
): Resolution {
  const declared = projectEnvironments(files);
  const named = standardPacks(files, declared[0]?.environment);
  const together = available.some((pack) => folds(pack) && named.includes(packRef(pack)));
  const resolve = (environment: string | undefined, deployTime: boolean) =>
    resolveDefinitions(files, {
      packs: [...available],
      ...(environment !== undefined && { environment }),
      envvars,
      environmentsTogether: true,
      replaceMe,
      ...(deployTime && { deployTime: true }),
    });
  const results = declared.map((item) =>
    together && !local(item, available)
      ? deployed(item, available, resolve)
      : alone(item.name, resolve(item.environment, false)),
  );
  return {
    environments: results.flatMap(({ environment }) => (environment ? [environment] : [])),
    reports: results.map(({ report }) => report),
    ok: results.every(({ report }) => !report.failed),
    together,
    local: declared.filter((item) => !together || local(item, available)).map((item) => item.name),
  };
}

/** Whether the pack builds environments together. */
export function folds(pack: Pack): boolean {
  return pack.buildEnvironments !== undefined;
}

/** How a standard names the pack: `<id>@<version>`. */
export function packRef(pack: Pack): string {
  return `${pack.id}@${pack.version}`;
}

/** Whether the model has a step of the pack, so the environment is one of its targets. */
export function isTarget(model: ResolvedModel, pack: Pack): boolean {
  return model.tables.some((table) =>
    [table.ingest, table.transform, table.store, table.serve].some(
      (step) => step?.pack === pack.id,
    ),
  );
}

/** The packs the standard names, read before anything is resolved; none when it cannot be read. */
function standardPacks(files: FileSource, environment: string | undefined): string[] {
  const loaded = resolveProject(files, {
    kinds: Object.values(kinds),
    ...(environment !== undefined && { environment }),
    envvars: {},
    deployEnvvars: true,
  });
  const standard = loaded.project?.documents.find((item) => item.kind === "Standard");
  const packs = (standard?.value as { packs?: unknown } | undefined)?.packs;
  return Array.isArray(packs) ? packs.filter((item) => typeof item === "string") : [];
}

/** An environment that runs on a pack that does not build environments together. */
function local(item: DeclaredEnvironment, available: readonly Pack[]): boolean {
  const pack = available.find((candidate) => candidate.id === item.runsOn);
  return pack !== undefined && !folds(pack);
}

type Resolve = (environment: string | undefined, deployTime: boolean) => ResolveResult;
type Result = { environment?: ResolvedEnvironment; report: Report };

/** An environment resolved with the host's values only, that model used for everything. */
function alone(name: string, result: ResolveResult, ...earlier: ResolveResult[]): Result {
  const report = reportOf(name, [...earlier, result]);
  if (!result.model) return { report };
  return { environment: { name, model: result.model, host: result.model }, report };
}

/** An environment resolved for deploy first, then with the host's values where a pack needs them. */
function deployed(item: DeclaredEnvironment, available: readonly Pack[], resolve: Resolve): Result {
  const deploy = resolve(item.environment, true);
  const model = deploy.model;
  if (!model) return { report: reportOf(item.name, [deploy]) };
  const targets = available.filter((pack) => isTarget(model, pack));
  if (!targets.some(folds)) return alone(item.name, resolve(item.environment, false), deploy);
  if (!targets.some((pack) => !folds(pack)))
    return {
      environment: { name: item.name, model, deploy: model },
      report: reportOf(item.name, [deploy]),
    };
  const host = resolve(item.environment, false);
  const report = reportOf(item.name, [deploy, host]);
  if (!host.model) return { report };
  return { environment: { name: item.name, model, deploy: model, host: host.model }, report };
}

/** The diagnostics of every resolution, each once; failed when any resolution failed. */
function reportOf(name: string, results: ResolveResult[]): Report {
  const seen = new Set<string>();
  const diagnostics = results
    .flatMap((result) => result.diagnostics)
    .filter((diagnostic) => {
      const { code, message, location } = diagnostic;
      const key = JSON.stringify([code, location?.file, location?.line, message]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return { name, failed: results.some((result) => !result.model), diagnostics };
}
