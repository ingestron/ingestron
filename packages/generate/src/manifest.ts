// Reads and writes the manifest: which files were generated, with digests.
import { digestOf } from "./digest.js";
import type { OutputFolder } from "./folder.js";
import { manifestFile, pathProblem } from "./paths.js";
import { problem, type Problem } from "./problems.js";

/** Path → digest of the content that was generated there. */
export type Manifest = ReadonlyMap<string, string>;

/** The manifest in `folder` (empty when there is none), or why it cannot be used. */
export type ManifestResult = { files: Manifest } | { problem: Problem };

/** Reads and checks the manifest in `folder`. */
export function readManifest(folder: OutputFolder): ManifestResult {
  const entry = folder.read(manifestFile);
  if (entry.kind === "absent") return { files: new Map() };
  if (entry.kind === "other") return damaged("is not a file");
  let data: unknown;
  try {
    data = JSON.parse(entry.content);
  } catch {
    return damaged("is not valid JSON");
  }
  return checkManifest(data);
}

function checkManifest(data: unknown): ManifestResult {
  if (!isRecord(data) || data.version !== 1 || !isRecord(data.files)) {
    return damaged('must be { "version": 1, "files": { … } }');
  }
  for (const [path, digest] of Object.entries(data.files)) {
    const reason = pathProblem(path);
    if (reason) return damaged(`lists "${path}", which ${reason}`);
    if (typeof digest !== "string") return damaged(`has no digest for "${path}"`);
  }
  return { files: new Map(Object.entries(data.files as Record<string, string>)) };
}

/** The manifest text for the wanted files: sorted paths, one per line. */
export function manifestText(wanted: ReadonlyMap<string, string>): string {
  const paths = [...wanted.keys()].sort();
  const files = Object.fromEntries(paths.map((path) => [path, digestOf(wanted.get(path) ?? "")]));
  return `${JSON.stringify({ version: 1, files }, null, 2)}\n`;
}

function damaged(reason: string): ManifestResult {
  const hint = "Restore it from version control, or delete it to start again.";
  return { problem: problem("BAD_MANIFEST", `${manifestFile} ${reason}. ${hint}`, manifestFile) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
