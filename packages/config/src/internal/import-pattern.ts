import { matchesGlob } from "./glob.js";
import { resolveProjectPath } from "./paths.js";

/**
 * The test for the paths one pattern of a manifest's `imports` matches, or undefined when the
 * pattern is refused (it leaves the project, or is absolute, has a backslash or a scheme).
 * The pattern is relative to the manifest's folder; `.` and empty parts are dropped and `..`
 * is resolved before the glob is applied (configuration specification, section 2).
 */
export function importMatcher(
  manifest: string,
  pattern: string,
): ((path: string) => boolean) | undefined {
  const full = resolveProjectPath(manifest, pattern);
  return full === undefined ? undefined : (path) => matchesGlob(path, full);
}

/**
 * True when a path of the project (relative to the folder of `project.yaml`) matches an
 * `imports` pattern, by the rules `imports` follows: `./flows/**` is `flows/**`, `a/../b` is
 * `b`, and a pattern that `imports` would refuse matches nothing. Other places that take file
 * patterns use it, so a pattern means the same everywhere.
 * @example
 * matchesImport("./flows/*.yaml", "flows/orders.yaml") // true
 * matchesImport("/flows/*.yaml", "flows/orders.yaml")  // false
 * @public
 */
export function matchesImport(pattern: string, path: string): boolean {
  return importMatcher("project.yaml", pattern)?.(path) ?? false;
}
