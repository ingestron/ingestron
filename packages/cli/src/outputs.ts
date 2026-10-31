// What is on disk under the output folder: folders generated before, and
// files in an output folder that were never generated.
import { existsSync, lstatSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { lockFile, manifestFile } from "@ingestron/generate";

/**
 * Every folder at or below `root` that holds a manifest, so was written by
 * generation at some point. Links are not followed.
 */
export function generatedFolders(root: string): string[] {
  if (!isFolder(root)) return [];
  const found = existsSync(join(root, manifestFile)) ? [root] : [];
  for (const name of readdirSync(root).sort()) found.push(...generatedFolders(join(root, name)));
  return found;
}

/**
 * The files in the output folder `root` that are neither wanted nor in its
 * manifest (`known`), as `/` paths. Folders inside it that are output
 * folders of their own (`others`, or any holding a manifest) are skipped.
 */
export function extraFiles(root: string, known: ReadonlySet<string>, others: string[]): string[] {
  const skip = new Set(others);
  const extra: string[] = [];
  const walk = (folder: string): void => {
    for (const name of readdirSync(folder).sort()) {
      const path = join(folder, name);
      if (isFolder(path)) {
        if (!skip.has(path) && !existsSync(join(path, manifestFile))) walk(path);
        continue;
      }
      const relativePath = relative(root, path).split(sep).join("/");
      if (!known.has(relativePath) && !ignored.has(name)) extra.push(relativePath);
    }
  };
  if (isFolder(root)) walk(root);
  return extra;
}

/** Files that are never reported: the manifest, the lock and Finder's notes. */
const ignored = new Set([manifestFile, lockFile, ".DS_Store"]);

function isFolder(path: string): boolean {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}
