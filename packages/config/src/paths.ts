// Project paths are relative to the project root and always use "/".

/**
 * Resolves `target` relative to the folder of `fromFile`.
 * Returns `undefined` when the result would leave the project: an absolute
 * path, a path with a scheme (`https:`, `C:`), a backslash, or too many `..`.
 * @example
 * resolveProjectPath("pipelines/a.yaml", "../shared/b.yaml") // "shared/b.yaml"
 */
export function resolveProjectPath(fromFile: string, target: string): string | undefined {
  if (target.startsWith("/")) return undefined;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(target)) return undefined;
  if (target.includes("\\")) return undefined;

  const parts = fromFile.split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (part === "" || part === ".") continue;
    if (part !== "..") {
      parts.push(part);
    } else if (parts.length > 0) {
      parts.pop();
    } else {
      return undefined;
    }
  }
  return parts.join("/");
}
