// The output folders and their files (spec/cli/outputs.md, sections 2 and 3):
// one per pack, in the standard's order, then the passports.
import type { FileSource } from "@ingestron/config";
import {
  environmentsDiagnostics,
  type Pack,
  type ResolvedModel,
  type SuppliedValue,
} from "@ingestron/definitions";
import { passports } from "../passport/passport.js";
import { packs } from "../packs/packs.js";
import {
  folds,
  isTarget,
  packRef,
  resolveEnvironments,
  type Report,
  type ResolvedEnvironment,
} from "./resolve-environments.js";

/** One output folder: its name, its path under the output folder, the environments it covers and its files. */
export interface Output {
  /** The pack's id, or `products`. */
  name: string;
  /** The folder under the output folder, with `/` between its parts. */
  folder: string;
  targets: string[];
  /**
   * Whether each target's files are in a folder of its own, named after it: true for a pack
   * that builds one environment at a time, and for the passports.
   */
  byEnvironment: boolean;
  files: Record<string, string>;
  /** For a pack that builds environments together: the names its files take each deploy-time value as. */
  deployValues?: SuppliedValue[];
}

/** The output folders, and what each pack that builds environments together reported; `ok` when no error. */
export interface Built {
  outputs: Output[];
  reports: Report[];
  ok: boolean;
}

/** Every environment generated together, as plan generates it: what it found, and what it gave. */
export interface Generated {
  /** Whether the standard names a pack that builds environments together. */
  together: boolean;
  /** The environments resolved with the host's values only, known before resolving. */
  local: string[];
  /** Whether every environment resolved. */
  resolved: boolean;
  /** Whether every environment resolved and every pack built its files. */
  ok: boolean;
  /** The environments that resolved. */
  environments: ResolvedEnvironment[];
  /** The output folders; none unless `ok`. */
  outputs: Output[];
  /** What resolving each environment found, in project.yaml's order. */
  environmentReports: Report[];
  /** What each pack that builds environments together reported. */
  packReports: Report[];
}

/** Resolves every environment and builds every output folder, writing nothing. */
export function generateAll(
  files: FileSource,
  available: readonly Pack[],
  envvars: Readonly<Record<string, string | undefined>>,
  replaceMe: "warning" | "error" = "warning",
): Generated {
  const resolution = resolveEnvironments(files, available, envvars, replaceMe);
  const { together, local, environments } = resolution;
  const found = { together, local, environments, environmentReports: resolution.reports };
  if (!resolution.ok) return { ...found, resolved: false, ok: false, outputs: [], packReports: [] };
  const built = buildOutputs(environments, available);
  const outputs = built.ok ? built.outputs : [];
  return { ...found, resolved: true, ok: built.ok, outputs, packReports: built.reports };
}

/** Builds every output folder from the environments, each resolved. */
export function buildOutputs(
  environments: readonly ResolvedEnvironment[],
  available: readonly Pack[],
): Built {
  const standard = environments[0]?.model.standard.packs ?? [];
  const used = standard.flatMap((ref) => available.filter((pack) => packRef(pack) === ref));
  const built = used.flatMap((pack) => {
    // Only an environment resolved for deploy is a target of a pack that builds environments together.
    const targets = environments.filter((item) =>
      folds(pack) ? item.deploy && isTarget(item.deploy, pack) : isTarget(item.model, pack),
    );
    if (targets.length === 0) return [];
    return [folds(pack) ? together(pack, targets) : apart(pack, targets)];
  });
  const outputs = built.flatMap(({ output }) => (output ? [output] : []));
  const products = environments.some((item) => item.model.products.length > 0)
    ? [productsOutput(environments)]
    : [];
  const reports = built.flatMap(({ report }) => (report ? [report] : []));
  return {
    outputs: [...outputs, ...products],
    reports,
    ok: reports.every((report) => !report.failed),
  };
}

type Result = { output?: Output; report?: Report };

/** A pack that builds environments together: one artefact from the targets' models, resolved for deploy. */
function together(pack: Pack, targets: readonly ResolvedEnvironment[]): Result {
  const models = Object.fromEntries(targets.map((item) => [item.name, item.deploy!]));
  const { files, deployValues, problems } = pack.buildEnvironments!(models);
  const diagnostics = environmentsDiagnostics(problems);
  const failed = diagnostics.some((diagnostic) => diagnostic.severity === "error");
  const report = diagnostics.length > 0 ? { name: pack.id, failed, diagnostics } : undefined;
  if (failed) return { ...(report && { report }) };
  const names = targets.map((item) => item.name);
  return {
    output: {
      name: pack.id,
      folder: pack.id,
      targets: names,
      byEnvironment: false,
      files,
      deployValues,
    },
    ...(report && { report }),
  };
}

/** Any other pack: each target's files from its model resolved with the host's values, in a folder of its own. */
function apart(pack: Pack, targets: readonly ResolvedEnvironment[]): Result {
  const files = Object.fromEntries(
    targets.flatMap((item) => within(item.name, pack.build(item.host ?? item.model))),
  );
  const names = targets.map((item) => item.name);
  return { output: { name: pack.id, folder: pack.id, targets: names, byEnvironment: true, files } };
}

/** The passports, each environment's in a folder of its own. */
function productsOutput(environments: readonly ResolvedEnvironment[]): Output {
  const files = Object.fromEntries(
    environments.flatMap((item) => within(item.name, passports(item.model))),
  );
  return {
    name: "products",
    folder: "products",
    targets: environments.map((item) => item.name),
    byEnvironment: true,
    files,
  };
}

function within(folder: string, files: Record<string, string>): [string, string][] {
  return Object.entries(files).map(([path, text]) => [`${folder}/${path}`, text]);
}

/**
 * The files each pack the standard names builds from one environment's model on its own:
 * `label` is `<pack>` for a pack that builds environments together and `<pack>/<environment>`
 * for any other, then `products/<environment>` for the passports. `request` reads the SQL
 * to run once from it.
 */
export function environmentOutputs(
  model: ResolvedModel,
  environment: string,
): { pack: string; label: string; files: Record<string, string> }[] {
  const used = packs.filter((pack) => model.standard.packs.includes(packRef(pack)));
  const outputs = used.map((pack) => ({
    pack: pack.id,
    label: folds(pack) ? pack.id : `${pack.id}/${environment}`,
    files: pack.build(model),
  }));
  return model.products.length > 0
    ? [...outputs, { pack: "products", label: `products/${environment}`, files: passports(model) }]
    : outputs;
}
