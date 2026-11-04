// The advice for an unset variable in an environment that a pack building every
// environment together deploys. Plan never reads such a variable: the deploying
// pipeline supplies it (spec/cli/outputs.md, section 6). So the editor does not ask
// for it in a .env file. Where plan refuses the value (DEPLOY_VALUE), plan's error says
// what to do, and the advice is left out; elsewhere it names what the files take it as.
import type { GeneratedOutputs } from "@ingestron/cli";
import type { AnyDiagnostic } from "@ingestron/config";

/** The environment, what generating found for it, and its environment file's name. */
export interface AdviceContext {
  name: string;
  generated: readonly AnyDiagnostic[];
  envFile: string;
}

/** The editor's own diagnostics, with the advice for each unset variable a deploying pipeline supplies. */
export function deployAdvice(
  diagnostics: readonly AnyDiagnostic[],
  generation: GeneratedOutputs,
  { name, generated, envFile }: AdviceContext,
): AnyDiagnostic[] {
  const refused = new Set(generated.filter((item) => item.code === "DEPLOY_VALUE").map(lineOf));
  const supplied = suppliedNames(generation, name);
  return diagnostics.flatMap((diagnostic) => {
    if (!unsetAdvice(diagnostic)) return [diagnostic];
    if (refused.has(lineOf(diagnostic))) return [];
    const message = advice(diagnostic.message, supplied, generation, name, envFile);
    if (message === undefined) return [diagnostic];
    // The location stays; config's hint about .env files is left out with its advice.
    return [
      {
        code: diagnostic.code,
        severity: diagnostic.severity,
        message,
        ...(diagnostic.location && { location: diagnostic.location }),
      },
    ];
  });
}

/**
 * What to say of an unset variable: with the names the files take it as, when they were
 * built; when generating failed, only that the deploying pipeline supplies it, if the
 * environment is deployed together. Undefined keeps config's advice.
 */
function advice(
  message: string,
  supplied: Map<string, string[]>,
  generation: GeneratedOutputs,
  name: string,
  envFile: string,
): string | undefined {
  const variable = /^(\S+) isn't set;/.exec(message)?.[1];
  if (variable === undefined) return undefined;
  const as = supplied.get(variable);
  const after = `Plan does not read it, so it needs no ${envFile} entry.`;
  if (as) return `${variable} is supplied when deploying, as ${as.join(" and ")}. ${after}`;
  if (!generation.ok && generation.deployed.includes(name))
    return `${variable} is supplied when deploying. ${after}`;
  return undefined;
}

/** The information config gives for a variable that is set nowhere. */
function unsetAdvice(diagnostic: AnyDiagnostic): boolean {
  return diagnostic.code === "ENVVAR_MISSING" && diagnostic.severity === "information";
}

function lineOf({ location }: AnyDiagnostic): string {
  return JSON.stringify([location?.file, location?.line]);
}

/**
 * For each variable that a pack building every environment together, and deploying this
 * environment, takes at deploy time: each name it is supplied as, such as
 * `` `BUNDLE_VAR_landing` (databricks) ``.
 */
function suppliedNames(generation: GeneratedOutputs, name: string): Map<string, string[]> {
  const names = new Map<string, string[]>();
  for (const output of generation.outputs) {
    if (output.byEnvironment || !output.targets.includes(name)) continue;
    for (const value of output.deployValues ?? [])
      names.set(value.name, [
        ...(names.get(value.name) ?? []),
        ...value.suppliedAs.map((item) => `\`${item}\` (${output.name})`),
      ]);
  }
  return names;
}
