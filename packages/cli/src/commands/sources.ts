// Where templates and standards come from: a built-in name, a folder, or a Git URL cloned with
// the user's own git (kits are in kit-source.ts). Nothing from a source is run.
import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { builtInTemplates, type Template } from "@ingestron/core";
import { readTemplate } from "@ingestron/core/internal";
import { clonedEntry, withoutCredentials } from "./clone.js";

export { withoutCredentials } from "./clone.js";

/** Sources come from the user's command line; one starting with "-" could pass for a git option. */
export function refuseOption(spec: string, what = "A template or standard"): void {
  if (spec.startsWith("-"))
    throw new Error(`${what} cannot start with "-": ${withoutCredentials(spec)}.`);
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
  return clonedEntry({ url, inside, kind });
}
