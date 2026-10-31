// The environments declared in project.yaml.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

/**
 * The environments to generate: the requested ones, else every environment
 * in project.yaml, else one unnamed environment (`undefined`).
 */
export function environmentsToGenerate(
  definitions: string,
  requested: string[],
): (string | undefined)[] {
  if (requested.length > 0) return requested;
  const manifest = join(definitions, "project.yaml");
  if (!existsSync(manifest)) return [undefined];
  try {
    const data = parse(readFileSync(manifest, "utf8")) as {
      environments?: Record<string, unknown>;
    };
    const names = Object.keys(data?.environments ?? {});
    return names.length > 0 ? names : [undefined];
  } catch {
    // Loading reports the problem with its location.
    return [undefined];
  }
}
