// How several files are written together: each to a temporary file beside its target first, then
// all renamed into place, so a failure while writing leaves every target as it was (the pattern
// of assistant-write.ts, for more than one file).
import { randomBytes } from "node:crypto";
import {
  accessSync,
  closeSync,
  constants,
  fchmodSync,
  lstatSync,
  mkdirSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  type Stats,
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

/** The refusal to write: a target is a link or something that is not a file. Nothing is written. */
export class WriteRefused extends Error {}

/**
 * What is at the path: undefined when nothing, else its status. A link, a folder or anything that
 * is not a regular file is refused, and so is an existing file this user cannot write, as
 * writing it in place would be.
 */
function regularFile(file: string): Stats | undefined {
  const now = lstatSync(file, { throwIfNoEntry: false });
  if (now === undefined) return undefined;
  if (!now.isFile())
    throw new WriteRefused(
      `${file} is not a regular file (it is a link or a folder). Nothing was written.`,
    );
  accessSync(file, constants.W_OK);
  return now;
}

/** Writes `text` to a new temporary file in the target's folder, with the target's mode if it exists. */
function stage(target: string, text: string): Staged {
  mkdirSync(dirname(target), { recursive: true });
  const existing = regularFile(target);
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
 * Writes every file, in order, creating folders as needed; a target that is a link, a folder or
 * any other file that is not a regular one is refused (`WriteRefused`), with nothing written.
 * Each is first written whole to a
 * temporary file in its own folder (created exclusively, with the original's mode when there is
 * one); only when every temporary file is written are they renamed over their targets. A failure
 * before the renames leaves every target as it was and no temporary file behind; the renames
 * themselves are single steps, so no file is ever half written.
 */
export function writeStaged(files: readonly StagedFile[]): void {
  const staged: Staged[] = [];
  try {
    // Every target is checked before anything is written, and again just before the renames, so
    // that a link or a folder put there meanwhile is never written through or over.
    for (const { file } of files) regularFile(file);
    for (const { file, text } of files) staged.push(stage(file, text));
    for (const { target } of staged) regularFile(target);
    for (const { temporary, target } of staged) renameSync(temporary, target);
  } finally {
    discard(staged);
  }
}
