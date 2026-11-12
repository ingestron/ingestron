// How several files are written together: each to a temporary file beside its target first, then
// all renamed into place, so a failure while writing leaves every target as it was (the pattern
// of assistant-write.ts, for more than one file).
import { randomBytes } from "node:crypto";
import {
  closeSync,
  constants,
  fchmodSync,
  mkdirSync,
  openSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";

/** A file to write: its path and its whole text. */
export interface StagedFile {
  file: string;
  text: string;
}

/** A temporary file, written, and the file it will replace. */
interface Staged {
  temporary: string;
  target: string;
}

/** The mode a new file gets: what `writeFileSync` would give it, before the umask. */
const created = 0o666;

/**
 * The file a path writes to: the path itself, or the file a link there points at, so that a link
 * is kept and its target replaced, as writing in place would.
 */
function targetOf(file: string): string {
  try {
    return realpathSync(file);
  } catch {
    return file;
  }
}

/** Writes `text` to a new temporary file in the target's folder, with the target's mode if it exists. */
function stage(target: string, text: string): Staged {
  mkdirSync(dirname(target), { recursive: true });
  const existing = statSync(target, { throwIfNoEntry: false });
  if (existing !== undefined && !existing.isFile()) throw new Error(`${target} is not a file.`);
  const temporary = join(
    dirname(target),
    `.${basename(target)}.${randomBytes(6).toString("hex")}.tmp`,
  );
  const descriptor = openSync(
    temporary,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
    existing === undefined ? created : 0o600,
  );
  try {
    try {
      if (existing !== undefined) fchmodSync(descriptor, existing.mode & 0o7777);
      writeFileSync(descriptor, text, "utf8");
    } finally {
      closeSync(descriptor);
    }
  } catch (error) {
    unlinkSync(temporary);
    throw error;
  }
  return { temporary, target };
}

/** Removes the temporary files that are still there. */
function discard(staged: readonly Staged[]): void {
  for (const { temporary } of staged)
    try {
      unlinkSync(temporary);
    } catch {
      // Already renamed into place, or gone.
    }
}

/**
 * Writes every file, in order, creating folders as needed. Each is first written whole to a
 * temporary file in its own folder (created exclusively, with the original's mode when there is
 * one); only when every temporary file is written are they renamed over their targets. A failure
 * before the renames leaves every target as it was and no temporary file behind; the renames
 * themselves are single steps, so no file is ever half written.
 */
export function writeStaged(files: readonly StagedFile[]): void {
  const staged: Staged[] = [];
  try {
    for (const { file, text } of files) staged.push(stage(targetOf(file), text));
    for (const { temporary, target } of staged) renameSync(temporary, target);
  } finally {
    discard(staged);
  }
}
