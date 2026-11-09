// The environments declared in project.yaml.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FileSource } from "@ingestron/config";
import { parse } from "yaml";

/** One environment project.yaml declares, with the pack its `runs-on` names, if any. */
export interface DeclaredEnvironment {
  /** The name to show and to name folders by: `default` when project.yaml declares none. */
  name: string;
  /** The environment to resolve; none when project.yaml declares none. */
  environment: string | undefined;
  runsOn?: string;
}

/**
 * The environments to generate: the requested ones, else every environment
 * in project.yaml, else one unnamed environment (`undefined`).
 * @internal
 */
export function environmentsToGenerate(
  definitions: string,
  requested: string[],
): (string | undefined)[] {
  if (requested.length > 0) return requested;
  const manifest = join(definitions, "project.yaml");
  const text = existsSync(manifest) ? readFileSync(manifest, "utf8") : undefined;
  return declaredEnvironments(text).map(({ environment }) => environment);
}

/** Every environment project.yaml declares, in its order, else the one environment `default`. */
export function projectEnvironments(files: FileSource): DeclaredEnvironment[] {
  return declaredEnvironments(files.read("project.yaml"));
}

function declaredEnvironments(text: string | undefined): DeclaredEnvironment[] {
  const none = [{ name: "default", environment: undefined }];
  if (text === undefined) return none;
  try {
    const data = parse(text) as { environments?: Record<string, { "runs-on"?: unknown }> } | null;
    const declared = Object.entries(data?.environments ?? {}).map(([name, settings]) => {
      const runsOn = settings?.["runs-on"];
      return { name, environment: name, ...(typeof runsOn === "string" && { runsOn }) };
    });
    return declared.length > 0 ? declared : none;
  } catch {
    // Loading reports the problem with its location.
    return none;
  }
}
