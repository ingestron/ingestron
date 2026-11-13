// How an existing or a new file of the project guide is written, never through a link and never
// leaving a half-written file (spec/cli/assistants.md, section 5).
import { randomBytes } from "node:crypto";
import {
  accessSync,
  closeSync,
  constants,
  fchmodSync,
  lstatSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";

/** The errors of `open` that mean the path is no longer what the check found. */
const changed = new Set(["EEXIST", "ELOOP", "EISDIR", "ENOTDIR"]);

/**
 * Writes `text` to the file at `file`, never through a link, even one made after the check. A new
 * file is created exclusively. An existing one is rewritten by writing a temporary file in the same
 * folder (created exclusively, with the original's mode) and renaming it over the target, so a
 * failed write leaves the original as it was, and the target is looked at again just before the
 * rename. False when the path turned out to be something else; the file is then left as it is.
 */
export function writeSafely(file: string, text: string, exists: boolean): boolean {
  return exists ? rewrite(file, text) : create(file, text);
}

/** Creates the file exclusively; false when something is there already. */
function create(file: string, text: string): boolean {
  let descriptor: number;
  try {
    descriptor = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o666);
  } catch (error) {
    if (changed.has((error as NodeJS.ErrnoException).code ?? "")) return false;
    throw error;
  }
  try {
    writeFileSync(descriptor, text, "utf8");
  } finally {
    closeSync(descriptor);
  }
  return true;
}

/** Rewrites an existing regular file through a temporary file in its folder. */
function rewrite(file: string, text: string): boolean {
  const before = lstatSync(file, { throwIfNoEntry: false });
  if (before === undefined || !before.isFile()) return false;
  // A file that is read-only for this user stays as it is, as it would if it were written in place.
  try {
    accessSync(file, constants.W_OK);
  } catch (error) {
    // Removed since it was looked at: it is no longer a regular file.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  const temporary = join(dirname(file), `.${basename(file)}.${randomBytes(6).toString("hex")}.tmp`);
  const descriptor = openSync(
    temporary,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
    0o600,
  );
  try {
    try {
      fchmodSync(descriptor, before.mode & 0o7777);
      writeFileSync(descriptor, text, "utf8");
    } finally {
      closeSync(descriptor);
    }
    // Just before the rename: still a regular file, not a link or a folder put there meanwhile.
    const now = lstatSync(file, { throwIfNoEntry: false });
    if (now === undefined || !now.isFile()) {
      unlinkSync(temporary);
      return false;
    }
    renameSync(temporary, file);
    return true;
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // The temporary file is already gone, or cannot be removed; the original is untouched.
    }
    throw error;
  }
}
