// Where templates, standards and kits come from: a built-in name, a folder, an installed kit,
// or a Git URL cloned with the user's own git. Nothing from a source is run.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  builtInTemplates,
  installedKits,
  parseKitSpec,
  readKit,
  type Kit,
  type Template,
} from "@ingestron/core";
import { compareVersions, readTemplate } from "@ingestron/core/internal";
import { clonedEntry, gitReason, withoutCredentials } from "./clone.js";

export { withoutCredentials } from "./clone.js";

/** Sources come from the user's command line; one starting with "-" could pass for a git option. */
function refuseOption(spec: string, what = "A template or standard"): void {
  if (spec.startsWith("-")) throw new Error(`${what} cannot start with "-": ${spec}.`);
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

/** The catalogue's repository: INGESTRON_STANDARDS_REPOSITORY, else Ingestron's own. */
function catalogueUrl(): string {
  return process.env.INGESTRON_STANDARDS_REPOSITORY || "https://github.com/ingestron/standards.git";
}

const noCleanup = () => undefined;

/**
 * A kit by its spec (spec/cli/kits.md, "Where kits are found"): installed with
 * `@ingestron/standards`; else the catalogue, cloned at the tag `<id>@<version>`; or, for
 * `<git-url>#<path>@<tag>`, that repository at that tag. Call `done()` when finished: it removes
 * any clone.
 */
export function kitSource(spec: string, cwd: string): { kit: Kit; done(): void } {
  refuseOption(spec, "A kit");
  const parsed = parseKitSpec(spec);
  if ("url" in parsed) {
    const { url, path, tag } = parsed;
    const found = clonedEntry({ url, inside: path, kind: "folder", tag, cwd });
    return readCloned(withoutCredentials(spec), found, () => readKit(found.path));
  }
  const { id, version } = parsed;
  const kits = installed(version === undefined ? id : `${id}@${version}`);
  const own = kits.filter((kit) => kit.id === id);
  if (version === undefined) return newestKit(id, kits, own, cwd);
  const found = own.find((kit) => kit.version === version);
  if (found) return { kit: found, done: noCleanup };
  const listed = catalogueVersions(id, cwd);
  if (typeof listed === "string")
    throw new Error(
      `The kit ${id}@${version} is not installed, and the catalogue could not be read: ${listed}`,
    );
  if (!listed.includes(version)) throw new Error(noVersion(id, version, kits, listed));
  return catalogueKit(id, version, cwd);
}

/** Installed kits; one that breaks a rule is reported after the spec asked for. */
function installed(spec: string): Kit[] {
  try {
    return installedKits();
  } catch (error) {
    throw new Error(`${spec}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** `<id>` alone: the newest version that is not a preview, installed, else in the catalogue. */
function newestKit(id: string, kits: Kit[], own: Kit[], cwd: string): { kit: Kit; done(): void } {
  let versions = own.map((kit) => kit.version);
  if (versions.length === 0) {
    const listed = catalogueVersions(id, cwd);
    if (typeof listed === "string")
      throw new Error(
        `The kit ${id} is not installed, and the catalogue could not be read: ${listed}`,
      );
    versions = listed;
  }
  if (versions.length === 0) throw new Error(noKit(id, kits));
  const general = versions.filter((version) => !version.endsWith("-preview"));
  if (general.length === 0)
    throw new Error(
      `The kit ${id} has only preview versions: ${versions.join(", ")}. Name one, such as ${id}@${versions.at(-1)}.`,
    );
  const newest = general.at(-1)!;
  const found = own.find((kit) => kit.version === newest);
  return found ? { kit: found, done: noCleanup } : catalogueKit(id, newest, cwd);
}

function noKit(id: string, kits: Kit[]): string {
  const ids = [...new Set(kits.map((kit) => kit.id))].join(", ") || "none";
  return `There is no kit ${id}, installed or in the catalogue. Installed kits: ${ids}.`;
}

/** The message for a version that is neither installed nor tagged in the catalogue. */
function noVersion(id: string, version: string, kits: Kit[], tagged: string[]): string {
  const versions = sortedVersions([
    ...kits.filter((kit) => kit.id === id).map((kit) => kit.version),
    ...tagged,
  ]);
  if (versions.length === 0) return noKit(id, kits);
  return `There is no version ${version} of the kit ${id}. It has: ${versions.join(", ")}.`;
}

function sortedVersions(versions: string[]): string[] {
  return [...new Set(versions)].sort(compareVersions);
}

/**
 * The versions of the kit tagged `<id>@<version>` in the catalogue, oldest first, or why the
 * catalogue could not be read.
 */
function catalogueVersions(id: string, cwd: string): string[] | string {
  let output: string;
  try {
    output = execFileSync("git", ["ls-remote", "--tags", "--", catalogueUrl()], {
      stdio: "pipe",
      cwd,
      encoding: "utf8",
    });
  } catch (error) {
    return withoutCredentials(gitReason(error));
  }
  const prefix = `refs/tags/${id}@`;
  const versions = output
    .split("\n")
    .map((line) => line.split("\t")[1]?.replace(/\^\{\}$/, "") ?? "")
    .filter((ref) => ref.startsWith(prefix))
    .map((ref) => ref.slice(prefix.length))
    .filter((version) => /^\d{4}-\d{2}-\d{2}(-preview)?$/.test(version));
  return sortedVersions(versions);
}

/** The catalogue cloned at the tag `<id>@<version>`, and `kits/<id>/<version>` read. */
function catalogueKit(id: string, version: string, cwd: string): { kit: Kit; done(): void } {
  const inside = `kits/${id}/${version}`;
  const found = clonedEntry({
    url: catalogueUrl(),
    inside,
    kind: "folder",
    tag: `${id}@${version}`,
    cwd,
  });
  return readCloned(`${id}@${version}`, found, () =>
    readKit(found.path, join(found.folder, "kits")),
  );
}

/** Reads the kit in a clone; a broken rule is reported after `spec`, and the clone removed. */
function readCloned(
  spec: string,
  cloned: { done(): void },
  read: () => Kit,
): { kit: Kit; done(): void } {
  try {
    return { kit: read(), done: cloned.done };
  } catch (error) {
    cloned.done();
    throw new Error(`${spec}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
