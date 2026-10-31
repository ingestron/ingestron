// An Ingestron project as the editor sees it: the folder with project.yaml,
// its files with open editors read before the disk, and its environments.
import { existsSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import {
  nodeFiles,
  resolveProject,
  type DefinitionDocument,
  type FileSource,
} from "@ingestron/config";
import { packs } from "@ingestron/cli";
import { kinds, resolveDefinitions } from "@ingestron/definitions";
import { parse } from "yaml";

/** A project folder, its files and the environments it declares. */
export interface Project {
  folder: string;
  files: FileSource;
  /** Declared environments, in order; empty when project.yaml declares none. */
  environments: string[];
}

/** The nearest folder at or above the file's folder that has project.yaml. */
export function projectFolderOf(path: string): string | undefined {
  let folder = dirname(path);
  for (;;) {
    if (existsSync(join(folder, "project.yaml"))) return folder;
    const parent = dirname(folder);
    if (parent === folder) return undefined;
    folder = parent;
  }
}

/**
 * The project in `folder`, with `open` (absolute path → text) read before the disk.
 * Open a fresh project after any edit or disk change to refresh cached editor features.
 */
export function openProject(folder: string, open: ReadonlyMap<string, string>): Project {
  const files = overlay(folder, open);
  return { folder, files, environments: environmentsOf(files) };
}

/** A path relative to the project, with forward slashes, or undefined outside it. */
export function inProject(folder: string, path: string): string | undefined {
  const inside = relative(folder, path);
  if (inside.startsWith("..") || inside === "") return undefined;
  return inside.split(sep).join("/");
}

function overlay(folder: string, open: ReadonlyMap<string, string>): FileSource {
  const disk = nodeFiles(folder);
  const edited = new Map<string, string>();
  for (const [path, text] of open) {
    const inside = inProject(folder, path);
    if (inside) edited.set(inside, text);
  }
  return {
    list: () => [...new Set([...disk.list(), ...edited.keys()])].sort(),
    read: (path) => edited.get(path) ?? disk.read(path),
    size: (path) => {
      const text = edited.get(path);
      return text === undefined ? disk.size?.(path) : Buffer.byteLength(text);
    },
  };
}

function environmentsOf(files: FileSource): string[] {
  try {
    const data = parse(files.read("project.yaml") ?? "") as { environments?: object } | null;
    return Object.keys(data?.environments ?? {});
  } catch {
    // The problem is reported with its location by the diagnostics.
    return [];
  }
}

const resolutions = new WeakMap<Project, Map<string, ReturnType<typeof resolveDefinitions>>>();

/** The project resolved for an environment with the CLI's packs, once per project snapshot. */
export function resolved(
  project: Project,
  environment: string | undefined,
): ReturnType<typeof resolveDefinitions> {
  let byEnvironment = resolutions.get(project);
  if (!byEnvironment) resolutions.set(project, (byEnvironment = new Map()));
  const key = environment ?? "";
  let result = byEnvironment.get(key);
  if (!result) {
    result = resolveDefinitions(project.files, { packs, ...(environment && { environment }) });
    byEnvironment.set(key, result);
  }
  return result;
}

const loadings = new WeakMap<Project, Map<string, readonly DefinitionDocument[] | undefined>>();

/**
 * The documents the project's imports load for an environment, with
 * `${values.…}` and the rest resolved; once per project snapshot. Undefined
 * when the project does not load.
 */
export function loadedDocuments(
  project: Project,
  environment: string | undefined,
): readonly DefinitionDocument[] | undefined {
  let byEnvironment = loadings.get(project);
  if (!byEnvironment) loadings.set(project, (byEnvironment = new Map()));
  const key = environment ?? "";
  if (!byEnvironment.has(key))
    byEnvironment.set(
      key,
      resolveProject(project.files, {
        kinds: Object.values(kinds),
        ...(environment && { environment }),
        envvars: {},
      }).project?.documents,
    );
  return byEnvironment.get(key);
}
