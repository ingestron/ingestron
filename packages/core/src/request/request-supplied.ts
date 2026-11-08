// The names under which the deploying pipeline supplies each deploy-time value,
// from building every environment as plan does (spec/cli/request.md, "Values to
// provide").
import type { Generated, Output } from "../generation/index.js";
import type { ResolvedEnvironment } from "../generation/index.js";

/** What one environment's request says about the names the deploying pipeline supplies. */
export interface Supplied {
  /** By variable, each name a pack's files take it as, written `` `name` (pack) ``. */
  variables: Map<string, string[]>;
  /** Each value a pack's files take that no variable gives, written as the variables' names are. */
  own: string[];
  /** True when generating has problems, so the names are not known. */
  unknown: boolean;
}

/** The names for one environment; none when no pack builds environments together, or it is local. */
export function suppliedFor(generated: Generated, name: string): Supplied | undefined {
  if (!generated.together || generated.local.includes(name)) return undefined;
  const environment = generated.environments.find((item) => item.name === name);
  // Resolved with the host's values only, as a target of no pack that builds environments together.
  if (environment && !environment.deploy) return undefined;
  const deploy = environment?.deploy;
  if (!generated.ok || !deploy) return { variables: new Map(), own: [], unknown: true };
  const mine = new Set((deploy.deployValues ?? []).map((value) => value.name));
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
