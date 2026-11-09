// What `ingestron plan` would write for the project, once per project snapshot:
// the CLI's own generation of every environment together, and the problems it
// finds that resolving one environment for the editor does not, such as a pack's
// notices and a value that cannot be supplied when deploying.
import { generatedOutputs, type GeneratedOutputs } from "@ingestron/core";
import type { AnyDiagnostic } from "@ingestron/config";
import { deployAdvice } from "./deploy-advice.js";
import { resolved, type Project } from "./project.js";

const generations = new WeakMap<Project, GeneratedOutputs>();

/**
 * Every output folder as plan builds it, with open editors read first; nothing, and the
 * PACK_LOAD error, when a pack cannot be loaded.
 */
export function generationOf(project: Project): GeneratedOutputs {
  let generation = generations.get(project);
  if (!generation) {
    generation = generatedOutputs(project.files);
    generations.set(project, generation);
  }
  return generation;
}

/** The name the CLI gives the environment: `default` when project.yaml declares none. */
export function environmentName(environment: string | undefined): string {
  return environment ?? "default";
}

/**
 * The editor's problems for the environment: what resolving it found, with the advice
 * for an unset variable that the deploying pipeline supplies made to say so, then what
 * generating found for it, and every pack's report, that resolving did not. The same code
 * at the same place is shown once, as the editor found it, so an unset variable that a
 * local environment reads stays information.
 */
export function editorDiagnostics(
  project: Project,
  environment: string | undefined,
): AnyDiagnostic[] {
  const generation = generationOf(project);
  const name = environmentName(environment);
  const generated = [
    ...generation.environmentReports.filter((report) => report.name === name),
    ...generation.packReports,
  ].flatMap((report) => report.diagnostics);
  const own = deployAdvice(resolved(project, environment).diagnostics, generation, {
    name,
    generated,
    envFile: environment === undefined ? ".env" : `.env.${environment}`,
  });
  const seen = new Set(resolved(project, environment).diagnostics.map(placeOf));
  const added = generated.filter((diagnostic) => {
    const place = placeOf(diagnostic);
    if (seen.has(place)) return false;
    seen.add(place);
    return true;
  });
  return [...own, ...added];
}

function placeOf({ code, location }: AnyDiagnostic): string {
  return JSON.stringify([code, location?.file, location?.line, location?.column]);
}
