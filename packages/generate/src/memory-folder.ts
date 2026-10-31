// An output folder held in memory, for tests and previews.
import type { Entry, OutputFolder } from "./folder.js";
import { lockFile } from "./paths.js";

/** Options for {@link memoryFolder}. */
export interface MemoryFolderOptions {
  /** Paths that hold something other than a file (a folder or link). */
  others?: string[];
}

/** A memory folder can also return all its files. */
export interface MemoryFolder extends OutputFolder {
  /** Every file, path → content, in path order. */
  snapshot(): Record<string, string>;
}

/**
 * An output folder in memory, starting with `files`.
 * @example
 * const folder = memoryFolder({ "bundle.yml": "bundle: {}\n" });
 */
export function memoryFolder(
  files: Readonly<Record<string, string>> = {},
  options: MemoryFolderOptions = {},
): MemoryFolder {
  const contents = new Map(Object.entries(files));
  const others = new Set(options.others);
  return {
    read(path: string): Entry {
      if (others.has(path)) return { kind: "other" };
      const content = contents.get(path);
      return content === undefined ? { kind: "absent" } : { kind: "file", content };
    },
    write: (path, content) => void contents.set(path, content),
    remove: (path) => void contents.delete(path),
    lock(): boolean {
      if (contents.has(lockFile)) return false;
      contents.set(lockFile, "");
      return true;
    },
    unlock: () => void contents.delete(lockFile),
    snapshot: () => Object.fromEntries([...contents].sort(([a], [b]) => (a < b ? -1 : 1))),
  };
}
