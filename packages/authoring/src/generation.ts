// What `ingestron plan` would write for the project, once per project snapshot:
// the CLI's own generation of every environment together, and the problems it
// finds that resolving one environment for the editor does not, such as a pack's
// notices and a value that cannot be supplied when deploying.
import { generatedOutputs, type GeneratedOutputs } from "@ingestron/cli";
import type { AnyDiagnostic } from "@ingestron/config";
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
 * The problems generating finds for the environment, and every pack's, that resolving it
 * for the editor did not: the same code at the same place is shown once, as the editor
 * found it, so an unset variable stays information.
 */
export function generationDiagnostics(
  project: Project,
  environment: string | undefined,
): AnyDiagnostic[] {
  const { environmentReports, packReports } = generationOf(project);
  const name = environmentName(environment);
  const found = [
    ...environmentReports.filter((report) => report.name === name),
    ...packReports,
  ].flatMap((report) => report.diagnostics);
  const seen = new Set(resolved(project, environment).diagnostics.map(placeOf));
  return found.filter((diagnostic) => {
    const place = placeOf(diagnostic);
    if (seen.has(place)) return false;
    seen.add(place);
    return true;
  });
}

function placeOf({ code, location }: AnyDiagnostic): string {
  return JSON.stringify([code, location?.file, location?.line, location?.column]);
}
