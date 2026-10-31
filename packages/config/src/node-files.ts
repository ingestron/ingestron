import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import type { FileSource } from "./files.js";

const skippedFolders = new Set([".git", "node_modules"]);

/**
 * Files from a folder on disk. Symbolic links to files are followed when
 * they stay inside the folder; links that point outside it are treated as
 * missing, so a project cannot read files it does not own. Symbolic links to
 * folders are not followed.
 * @example
 * nodeFiles("./definitions").read("project.yaml")
 */
export function nodeFiles(root: string): FileSource {
  const realRoot = realpathSync(root);
  return {
    list: () => listFiles(realRoot, ""),
    read: (path) => {
      const file = fileInsideRoot(realRoot, path);
      return file === undefined ? undefined : readFileSync(file, "utf8");
    },
    size: (path) => {
      const file = fileInsideRoot(realRoot, path);
      return file === undefined ? undefined : statSync(file).size;
    },
  };
}

function listFiles(root: string, folder: string): string[] {
  const paths: string[] = [];
  for (const entry of readdirSync(join(root, folder), { withFileTypes: true })) {
    const path = folder ? `${folder}/${entry.name}` : entry.name;
    if (entry.isDirectory() && !skippedFolders.has(entry.name)) {
      paths.push(...listFiles(root, path));
    } else if (entry.isFile() || fileInsideRoot(root, path) !== undefined) {
      paths.push(path);
    }
  }
  return paths.sort();
}

/** The real path of a regular file inside `root`, after following links; otherwise `undefined`. */
function fileInsideRoot(root: string, path: string): string | undefined {
  let realPath: string;
  try {
    realPath = realpathSync(join(root, path));
  } catch {
    return undefined;
  }
  const inside = relative(root, realPath);
  const leavesRoot = inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside);
  return leavesRoot || !statSync(realPath).isFile() ? undefined : realPath;
}
