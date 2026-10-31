// Rules for wanted paths, so generation stays inside the output folder and
// works the same on every operating system.
import { problem, type Problem } from "./problems.js";

/** The manifest's file name in the output folder. */
export const manifestFile = ".generated.json";
/** The lock's file name in the output folder. */
export const lockFile = ".generated.lock";

/** Why `path` cannot be generated, or undefined when it is fine. */
export function pathProblem(path: string): string | undefined {
  if (path === "" || path.startsWith("/")) return "is not a relative path";
  if (/[\\:\0]/.test(path)) return 'contains "\\", ":" or a NUL character';
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return 'has an empty, "." or ".." part';
  }
  if (path === manifestFile || path === lockFile) return "is reserved for the manifest and lock";
  if (segments.includes(".git")) return "is inside a .git folder";
  return undefined;
}

/** Problems with the wanted paths, in path order, including letter-case clashes. */
export function checkWantedPaths(paths: readonly string[]): Problem[] {
  const problems: Problem[] = [];
  const seen = new Map<string, string>();
  for (const path of [...paths].sort()) {
    const reason = pathProblem(path);
    if (reason) {
      problems.push(problem("BAD_PATH", `"${path}" ${reason}.`, path));
      continue;
    }
    const earlier = seen.get(path.toLowerCase());
    if (earlier !== undefined) {
      const message = `"${path}" differs from "${earlier}" only in letter case.`;
      problems.push(problem("BAD_PATH", message, path));
    }
    seen.set(path.toLowerCase(), path);
  }
  return problems;
}
