// The output folder as the planner and applier see it. Implementations:
// memoryFolder (tests, previews) and nodeFolder (real files).

/** What is at a path: a text file, nothing, or something else (a folder or link). */
export type Entry = { kind: "file"; content: string } | { kind: "absent" } | { kind: "other" };

/**
 * Access to one output folder. Paths are relative and use `/`.
 * @example
 * const entry = folder.read("jobs/orders.yml");
 * if (entry.kind === "file") console.log(entry.content);
 */
export interface OutputFolder {
  read(path: string): Entry;
  /** Replaces the file in one step (no half-written file), creating folders as needed. */
  write(path: string, content: string): void;
  /** Removes the file. Folders left empty may be removed too. */
  remove(path: string): void;
  /** Takes the folder's generation lock. False when someone else holds it. */
  lock(): boolean;
  unlock(): void;
}
