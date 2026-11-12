// The environment the source commands resolve or load for (spec/cli/sources.md, sections 4 to 6).
import type { FileSource } from "@ingestron/config";
import { projectEnvironments } from "../generation/index.js";

/**
 * The environment given, else the first environment project.yaml declares, so that a project whose
 * values differ by environment resolves without --env; none when it declares none. `name` is what
 * the request's title shows: the environment, or `default` for none.
 */
export function sourceEnvironment(
  files: FileSource,
  given: string | undefined,
): { name: string; environment?: string } {
  if (given !== undefined) return { name: given, environment: given };
  const [first] = projectEnvironments(files);
  return first?.environment === undefined
    ? { name: "default" }
    : { name: first.name, environment: first.environment };
}
