// Where templates and standards come from: a built-in name, a folder, or a
// Git URL cloned with the user's own git. Nothing from a source is run.
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { builtInTemplates, readTemplate, type Template } from "./templates.js";

/** The URL without `user:password@`, for messages and the standard's "From" line. */
export function withoutCredentials(text: string): string {
  return text.replace(/(\/\/)[^/@\s]+@/g, "$1");
}

/** Sources come from the user's command line; one starting with "-" could pass for a git option. */
function refuseOption(spec: string): void {
  if (spec.startsWith("-"))
    throw new Error(`A template or standard cannot start with "-": ${spec}.`);
}

/** A Git URL rather than a path or a name. */
export function isGitUrl(spec: string): boolean {
  return (
    /^(https?|ssh|file|git):\/\//.test(spec) ||
    /^[\w.-]+@[\w.-]+:/.test(spec) ||
    /\.git(#|$)/.test(spec)
  );
}

/** A template from a built-in name, a folder or a Git URL (`#` names a sub-folder). Call `done()` when finished. */
export function templateSource(spec: string, cwd: string): { template: Template; done(): void } {
  refuseOption(spec);
  if (isGitUrl(spec)) {
    const { path, done } = cloned(spec, "folder");
    try {
      return { template: readTemplate(path, basename(path)), done };
    } catch (error) {
      done();
      throw error;
    }
  }
  const folder = resolve(cwd, spec);
  if (spec.includes("/") || spec.startsWith(".")) {
    if (!existsSync(folder)) throw new Error(`No template folder ${spec}.`);
    return { template: readTemplate(folder, basename(folder)), done: () => undefined };
  }
  const builtIns = builtInTemplates();
  const template = builtIns.find((item) => item.name === spec);
  if (!template) {
    const names = builtIns.map((item) => item.name).join(", ");
    throw new Error(`No template "${spec}". Built-in templates: ${names}.`);
  }
  return { template, done: () => undefined };
}

/** A standard file from a path or a Git URL with `#path/to/standard.yaml`. */
export function standardSource(
  spec: string,
  cwd: string,
): { file: string; source: string; done(): void } {
  if (!isGitUrl(spec)) {
    const file = resolve(cwd, spec);
    if (!existsSync(file)) throw new Error(`No standard file ${spec}.`);
    return { file, source: spec, done: () => undefined };
  }
  const { path, done } = cloned(spec, "file");
  return { file: path, source: withoutCredentials(spec), done };
}

/**
 * Clones the URL before `#` into a temporary folder and returns the entry
 * after `#`, which must really be inside the clone (no links) and be a
 * regular file or folder as asked.
 */
function cloned(spec: string, kind: "file" | "folder"): { path: string; done(): void } {
  const [url = "", inside = ""] = spec.split("#");
  if (inside.split("/").includes("..") || inside.startsWith("/"))
    throw new Error(`The part after "#" must stay inside the repository: ${inside}.`);
  const folder = mkdtempSync(join(tmpdir(), "ingestron-template-"));
  const done = () => rmSync(folder, { recursive: true, force: true });
  try {
    clone(url, folder);
    return { path: checkedEntry(folder, inside, kind), done };
  } catch (error) {
    done();
    throw error;
  }
}

function clone(url: string, folder: string): void {
  // No hooks, no submodules; "--" so the URL can never be read as an option.
  const args = ["-c", "core.hooksPath=/dev/null", "clone", "--depth", "1", "--quiet"];
  try {
    execFileSync("git", [...args, "--no-recurse-submodules", "--", url, folder], { stdio: "pipe" });
  } catch (error) {
    const reason = (error as { stderr?: Buffer }).stderr?.toString().trim() ?? String(error);
    throw new Error(withoutCredentials(`Could not clone ${url}: ${reason}`));
  }
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
