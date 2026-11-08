// An output folder on disk. Paths that lead outside it through links are
// treated as "other", so generation never reads or writes outside.
import { randomUUID } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import type { Entry, OutputFolder } from "./folder.js";
import { lockFile } from "./paths.js";

/**
 * The output folder at `root`, created when first written to.
 * @example
 * const folder = nodeFolder("build/bundle");
 */
export function nodeFolder(root: string): OutputFolder {
  const full = (path: string): string => join(root, path);
  return {
    read: (path) => readEntry(root, full(path)),
    write(path, content) {
      const target = full(path);
      makeFolders(root, dirname(target));
      if (!isInside(root, dirname(target)))
        throw new Error("its folder leads outside the output folder");
      const temporary = `${target}.${randomUUID()}.tmp`;
      writeFileSync(temporary, content, { flag: "wx" });
      renameSync(temporary, target);
    },
    remove(path) {
      unlinkSync(full(path));
      removeEmptyFolders(root, dirname(full(path)));
    },
    lock: () => takeLock(join(root, lockFile)),
    unlock: () => rmSync(join(root, lockFile), { force: true }),
  };
}

function readEntry(root: string, target: string): Entry {
  try {
    if (!lstatSync(target).isFile() || !isInside(root, dirname(target))) return { kind: "other" };
    return { kind: "file", content: readFileSync(target, "utf8") };
  } catch (error) {
    if (codeOf(error) === "ENOENT" || codeOf(error) === "ENOTDIR") return { kind: "absent" };
    throw error;
  }
}

/**
 * Creates `folder` one level at a time below `root`. Stops before creating
 * anything when a step on the way is a link or a file, so no folder is ever
 * made outside the output folder.
 */
function makeFolders(root: string, folder: string): void {
  mkdirSync(root, { recursive: true });
  let current = root;
  for (const part of relative(root, folder).split(sep).filter(Boolean)) {
    current = join(current, part);
    try {
      if (!lstatSync(current).isDirectory())
        throw new Error("its folder leads outside the output folder");
    } catch (error) {
      if (codeOf(error) !== "ENOENT") throw error;
      mkdirSync(current);
    }
  }
}

/** True when `folder`, after following links, is `root` or inside it. */
function isInside(root: string, folder: string): boolean {
  const path = relative(realpathSync(root), realpathSync(folder));
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function takeLock(path: string): boolean {
  mkdirSync(dirname(path), { recursive: true });
  try {
    writeFileSync(path, `${process.pid}\n`, { flag: "wx" });
    return true;
  } catch (error) {
    if (codeOf(error) === "EEXIST") return false;
    throw error;
  }
}

/** Removes `folder` and its parents while they are empty, stopping at `root`. */
function removeEmptyFolders(root: string, folder: string): void {
  let current = folder;
  while (relative(root, current) !== "" && !relative(root, current).startsWith("..")) {
    try {
      rmdirSync(current);
    } catch {
      return;
    }
    current = dirname(current);
  }
}

function codeOf(error: unknown): string | undefined {
  return error instanceof Error && "code" in error ? String(error.code) : undefined;
}
