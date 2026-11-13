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

/**
 * The refusal to write: a target is a link or something that is not a file, or a file or folder
 * this user cannot write (`code` is then the system's, such as `EACCES`). Nothing is written,
 * unless `written` is set: the target that was put in place before `file` could not be. `file` is
 * the path as given; `text` says it again with whatever names the caller shows.
 */
export class WriteRefused extends Error {
  constructor(
    readonly file: string,
    readonly code?: string,
    readonly written?: string,
  ) {
    super(WriteRefused.say(file, code, written));
  }

  /** The refusal naming `shown`, the path as the user knows it, and `written` as it is known. */
  static say(shown: string, code?: string, written?: string): string {
    if (code === undefined)
      return `${shown} is not a regular file (it is a link or a folder). Nothing was written.`;
    return written === undefined
      ? `Could not write ${shown}: ${code}. Nothing was written.`
      : `Could not write ${shown}: ${code}. ${written} was written; import again to finish.`;
  }

  /** The refusal naming its files by `shown` instead of the paths it was given. */
  text(shown: (file: string) => string): string {
    return WriteRefused.say(
      shown(this.file),
      this.code,
      this.written === undefined ? undefined : shown(this.written),
    );
  }
}

/** Runs `step`; an error the system gave a code to is a refusal naming `target`, never a temporary file. */
function naming<T>(target: string, step: () => T, written?: string): T {
  try {
    return step();
  } catch (error) {
    if (error instanceof WriteRefused) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    if (code === undefined) throw error;
    throw new WriteRefused(target, code, written);
  }
}

/**
 * What is at the path: undefined when nothing, else its status. A link, a folder or anything that
 * is not a regular file is refused, and so is an existing file this user cannot write, as
 * writing it in place would be.
 */
function regularFile(file: string): Stats | undefined {
  const now = lstatSync(file, { throwIfNoEntry: false });
  if (now === undefined) return undefined;
  if (!now.isFile()) throw new WriteRefused(file);
  try {
    accessSync(file, constants.W_OK);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === undefined) throw error;
    throw new WriteRefused(file, code);
  }
  return now;
}

/** Writes `text` to a new temporary file in the target's folder, with the target's mode if it exists. */
function stage(target: string, text: string): Staged {
  naming(target, () => mkdirSync(dirname(target), { recursive: true }));
  const existing = regularFile(target);
  const temporary = join(
    dirname(target),
    `.${basename(target)}.${randomBytes(6).toString("hex")}.tmp`,
  );
  const descriptor = naming(target, () =>
    openSync(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      existing === undefined ? created : 0o600,
    ),
  );
  try {
    try {
      if (existing !== undefined) fchmodSync(descriptor, existing.mode & 0o7777);
      writeFileSync(descriptor, text, "utf8");
    } finally {
      closeSync(descriptor);
    }
  } catch (error) {
    // The write's error is the refusal; a temporary file that cannot be removed is left behind.
    try {
      unlinkSync(temporary);
    } catch {
      // Its own error would hide the write's.
    }
    return naming(target, () => {
      throw error;
    });
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
 * themselves are single steps, so no file is ever half written. An error the system gave a code
 * to is a `WriteRefused` naming the target, and one from a rename after the first names that
 * first target as written.
 */
export function writeStaged(files: readonly StagedFile[]): void {
  const staged: Staged[] = [];
  try {
    // Every target is checked before anything is written, and again just before the renames, so
    // that a link or a folder put there meanwhile is never written through or over.
    for (const { file } of files) regularFile(file);
    for (const { file, text } of files) staged.push(stage(file, text));
    for (const { target } of staged) regularFile(target);
    // A rename that fails after the first succeeded leaves the first in place, and says so.
    staged.forEach(({ temporary, target }, index) =>
      naming(
        target,
        () => renameSync(temporary, target),
        staged[0] && index > 0 ? staged[0].target : undefined,
      ),
    );
  } finally {
    discard(staged);
  }
}
