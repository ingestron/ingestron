// Where kits come from (spec/cli/kits.md, "Where kits are found"): installed with
// @ingestron/standards, the catalogue cloned at a tag, or a Git URL cloned at a tag, with the
// user's own git. Nothing from a kit is run.
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { installedKits, parseKitSpec, readKit, type Kit } from "@ingestron/core";
import { compareVersions, satisfies } from "@ingestron/core/internal";
import { cliVersion } from "../version.js";
import { clonedEntry, gitReason, gitTimeouts, kitGit, withoutCredentials } from "./clone.js";
import { refuseOption } from "./sources.js";

/** The catalogue's repository: INGESTRON_STANDARDS_REPOSITORY, else Ingestron's own. */
function catalogueUrl(): string {
  return process.env.INGESTRON_STANDARDS_REPOSITORY || "https://github.com/ingestron/standards.git";
}

const noCleanup = () => undefined;

/** A kit found by its spec; `note` is a line to print first, when there is one. */
export interface KitFound {
  kit: Kit;
  done(): void;
  note?: string;
}

/**
 * A kit by its spec (spec/cli/kits.md, "Where kits are found"): installed with
 * `@ingestron/standards`; else the catalogue, cloned at the tag `<id>@<version>`; or, for
 * `<git-url>#<path>@<tag>`, that repository at that tag. `<id>` alone is the newest version that
 * is not a preview, installed or in the catalogue's tags. Call `done()` when finished: it removes
 * any clone.
 */
export function kitSource(spec: string, cwd: string): KitFound {
  refuseOption(spec, "A kit");
  const parsed = parseKitSpec(spec);
  if ("url" in parsed) {
    const { url, path, tag } = parsed;
    const git = kitGit(url, cwd, gitTimeouts.clone);
    const found = clonedEntry({ url, inside: path, kind: "folder", tag, git });
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

/**
 * `<id>` alone: the newest version that is not a preview among the installed ones and the
 * catalogue's tags; the newest installed, with a note, when the catalogue cannot be read.
 */
function newestKit(id: string, kits: Kit[], own: Kit[], cwd: string): KitFound {
  const installedVersions = own.map((kit) => kit.version);
  const listed = catalogueVersions(id, cwd);
  if (typeof listed === "string" && installedVersions.length === 0)
    throw new Error(
      `The kit ${id} is not installed, and the catalogue could not be read: ${listed}`,
    );
  const unreachable = typeof listed === "string";
  const versions = sortedVersions([...installedVersions, ...(unreachable ? [] : listed)]);
  if (versions.length === 0) throw new Error(noKit(id, kits));
  const general = versions.filter((version) => !version.endsWith("-preview"));
  if (general.length === 0)
    throw new Error(
      `The kit ${id} has only preview versions: ${versions.join(", ")}. Name one, such as ${id}@${versions.at(-1)}.`,
    );
  const newest = general.at(-1)!;
  const found = own.find((kit) => kit.version === newest);
  if (!found) {
    // The newest version is in the catalogue only. If it cannot be cloned, an installed one does.
    const fallback = own.filter((kit) => !kit.version.endsWith("-preview")).at(-1);
    let cloned: Cloned;
    try {
      cloned = catalogueClone(id, newest, cwd);
    } catch (error) {
      if (!fallback) throw error;
      return usingInstalled(id, fallback);
    }
    return readCloned(`${id}@${newest}`, cloned, () =>
      readKit(cloned.path, join(cloned.folder, "kits")),
    );
  }
  if (!unreachable) return { kit: found, done: noCleanup };
  return usingInstalled(id, found);
}

/** The installed kit used for `<id>` alone when the catalogue gave nothing, with its note. */
function usingInstalled(id: string, kit: Kit): KitFound {
  const note = `Could not reach the catalogue; using the newest installed version, ${id}@${kit.version}.`;
  return { kit, done: noCleanup, note };
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

/** The versions of the kit tagged `<id>@<version>` in the catalogue, oldest first, or why it could not be read. */
function catalogueVersions(id: string, cwd: string): string[] | string {
  const tagged = catalogueKits(cwd);
  if (typeof tagged === "string") return tagged;
  return sortedVersions(tagged.filter((item) => item.id === id).map((item) => item.version));
}

/**
 * Every kit version the catalogue tags `<id>@<version>` (`git ls-remote --tags`), each once, or
 * why the catalogue could not be read.
 */
export function catalogueKits(cwd: string): { id: string; version: string }[] | string {
  const url = catalogueUrl();
  let output: string;
  try {
    output = execFileSync("git", ["ls-remote", "--tags", "--", url], {
      stdio: "pipe",
      encoding: "utf8",
      ...kitGit(url, cwd, gitTimeouts.lsRemote),
    });
  } catch (error) {
    return withoutCredentials(gitReason(error, gitTimeouts.lsRemote));
  }
  const tags = output
    .split("\n")
    .map((line) => line.split("\t")[1]?.replace(/\^\{\}$/, "") ?? "")
    .map((ref) =>
      /^refs\/tags\/([a-z0-9-]+\/[a-z0-9-]+)@(\d{4}-\d{2}-\d{2}(?:-preview)?)$/.exec(ref),
    )
    .filter((match) => match !== null);
  return [...new Set(tags.map(([, id, version]) => `${id}@${version}`))].map((tag) => {
    const [id = "", version = ""] = tag.split("@");
    return { id, version };
  });
}

/** Refuses a kit whose `requires.ingestron` this CLI's version does not meet. */
export function refuseNewer(kit: Kit): void {
  const version = cliVersion();
  if (!satisfies(version, kit.requires.ingestron))
    throw new Error(
      `The kit ${kit.id}@${kit.version} needs ingestron ${kit.requires.ingestron}; this is ${version}.`,
    );
}

type Cloned = ReturnType<typeof clonedEntry>;

/** The catalogue cloned at the tag `<id>@<version>`, with the kit's folder in it. */
function catalogueClone(id: string, version: string, cwd: string): Cloned {
  const url = catalogueUrl();
  return clonedEntry({
    url,
    inside: `kits/${id}/${version}`,
    kind: "folder",
    tag: `${id}@${version}`,
    git: kitGit(url, cwd, gitTimeouts.clone),
  });
}

/** The catalogue cloned at the tag `<id>@<version>`, and `kits/<id>/<version>` read. */
function catalogueKit(id: string, version: string, cwd: string): KitFound {
  const found = catalogueClone(id, version, cwd);
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
