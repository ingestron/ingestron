// Cloning a Git URL with the user's own git into a temporary folder: shallow, at a tag when
// one is given, with no hooks and no submodules. Nothing from the clone is run.
import { execFileSync } from "node:child_process";
import { lstatSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";

/** The URL without `user:password@`, for messages and the standard's "From" line. */
export function withoutCredentials(text: string): string {
  return text.replace(/(\/\/)[^/@\s]+@/g, "$1");
}

/** Where git runs and with what environment. */
interface GitPlace {
  cwd: string;
  env: NodeJS.ProcessEnv;
}

/** Where to clone from, what to take from the clone, at which tag, and where git runs. */
interface Cloning {
  url: string;
  inside: string;
  kind: "file" | "folder";
  tag?: string;
  git?: GitPlace;
}

/**
 * How git runs for a kit's repository (spec/cli/kits.md, "Git"): in a temporary folder, not the
 * user's `folder`, unless the URL is a relative path; and never asking for a password.
 */
export function kitGit(url: string, folder: string): GitPlace {
  const named = /^[a-z][a-z0-9+.-]*:/i.test(url) || /^[\w.-]+@[\w.-]+:/.test(url);
  const relativePath = !named && !isAbsolute(url);
  return {
    cwd: relativePath ? folder : tmpdir(),
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  };
}

/** Clones `url` (at `tag`) into a temporary folder; returns the entry `inside` it and the clone. */
export function clonedEntry({ url, inside, kind, tag, git }: Cloning): {
  path: string;
  folder: string;
  done(): void;
} {
  if (inside.split("/").includes("..") || inside.startsWith("/"))
    throw new Error(`The part after "#" must stay inside the repository: ${inside}.`);
  const folder = mkdtempSync(join(tmpdir(), "ingestron-template-"));
  const done = () => rmSync(folder, { recursive: true, force: true });
  try {
    clone(url, folder, tag, git);
    return { path: checkedEntry(folder, inside, kind), folder, done };
  } catch (error) {
    done();
    throw error;
  }
}

function clone(url: string, folder: string, tag?: string, git?: GitPlace): void {
  // No hooks, no submodules; "--" so the URL can never be read as an option.
  const args = ["-c", "core.hooksPath=/dev/null", "clone", "--depth", "1", "--quiet"];
  const at = tag === undefined ? [] : ["--branch", tag];
  try {
    execFileSync("git", [...args, ...at, "--no-recurse-submodules", "--", url, folder], {
      stdio: "pipe",
      ...git,
    });
  } catch (error) {
    throw new Error(withoutCredentials(`Could not clone ${url}: ${gitReason(error)}`));
  }
}

/** What git said on standard error, else the error itself. */
export function gitReason(error: unknown): string {
  return (error as { stderr?: Buffer }).stderr?.toString().trim() || String(error);
}

function checkedEntry(folder: string, inside: string, kind: "file" | "folder"): string {
  const path = join(folder, inside);
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (!stat) throw new Error(`The repository has no "${inside}".`);
  const real = relative(realpathSync(folder), realpathSync(path));
  const isKind = kind === "file" ? stat.isFile() : stat.isDirectory();
  if (!isKind || real.startsWith(".."))
    throw new Error(
      `"${inside || "."}" in the repository is not a ${kind === "file" ? "regular file" : "folder"}.`,
    );
  return path;
}
