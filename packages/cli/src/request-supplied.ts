// The names under which the deploying pipeline supplies each deploy-time value,
// from building every environment as plan does (spec/cli/request.md, "Values to
// provide").
import type { FileSource } from "@ingestron/config";
import type { Pack } from "@ingestron/definitions";
import { buildOutputs, type Output } from "./build-outputs.js";
import { resolveEnvironments, type ResolvedEnvironment } from "./resolve-environments.js";

/** Every environment generated together: whether that worked, and what it gave. */
export interface Generated {
  /** Whether the standard names a pack that builds environments together. */
  together: boolean;
  ok: boolean;
  environments: ResolvedEnvironment[];
  outputs: Output[];
}

/** What one environment's request says about the names the deploying pipeline supplies. */
export interface Supplied {
  /** By variable, each name a pack's files take it as, written `` `name` (pack) ``. */
  variables: Map<string, string[]>;
  /** Each value a pack's files take that no variable gives, written as the variables' names are. */
  own: string[];
  /** True when generating has problems, so the names are not known. */
  unknown: boolean;
}

/** Builds every environment as plan does, writing nothing. */
export function generateAll(
  files: FileSource,
  available: readonly Pack[],
  envvars: Readonly<Record<string, string | undefined>>,
): Generated {
  const resolution = resolveEnvironments(files, available, envvars);
  const { together, environments } = resolution;
  if (!resolution.ok) return { together, ok: false, environments: [], outputs: [] };
  const built = buildOutputs(environments, available);
  return { together, ok: built.ok, environments, outputs: built.outputs };
}

/** The names for one environment; none when no pack builds environments together, or it is local. */
export function suppliedFor(generated: Generated, name: string): Supplied | undefined {
  if (!generated.together) return undefined;
  if (!generated.ok) return { variables: new Map(), own: [], unknown: true };
  const environment = generated.environments.find((item) => item.name === name);
  if (!environment?.deploy) return undefined;
  const mine = new Set((environment.deploy.deployValues ?? []).map((value) => value.name));
  const supplied: Supplied = { variables: new Map(), own: [], unknown: false };
  for (const output of generated.outputs.filter((item) => item.targets.includes(name)))
    addNames(supplied, output, variablesOf(generated.environments, output.targets), mine);
  return supplied;
}

/** One output folder's names: a variable's when this environment has it, else the pack's own value. */
function addNames(supplied: Supplied, output: Output, variables: Set<string>, mine: Set<string>) {
  for (const value of output.deployValues ?? []) {
    const names = value.suppliedAs.map((as) => `\`${as}\` (${output.name})`);
    if (!variables.has(value.name)) supplied.own.push(...names);
    else if (mine.has(value.name))
      supplied.variables.set(value.name, [...(supplied.variables.get(value.name) ?? []), ...names]);
  }
}

/** The names of the deploy-time values of the targets' models. */
function variablesOf(environments: readonly ResolvedEnvironment[], targets: string[]): Set<string> {
  return new Set(
    environments
      .filter((item) => targets.includes(item.name))
      .flatMap((item) => (item.deploy?.deployValues ?? []).map((value) => value.name)),
  );
}
