// State shared by every step of one load: where files come from, the limits,
// the diagnostics found so far, and files already parsed.

import { error, type Diagnostic, type Location } from "./diagnostics.js";
import type { FileSource } from "./files.js";
import type { Limits } from "./limits.js";
import { parseYamlFile, type YamlFile } from "./yaml-file.js";

/** Everything one call to `resolveProject` works with. */
export interface LoadContext {
  files: FileSource;
  limits: Limits;
  envvars: Readonly<Record<string, string | undefined>>;
  diagnostics: Diagnostic[];
  /**
   * Successfully parsed YAML by path. Failures are not cached: each reference
   * to a broken file reports again, so no reference can fail silently.
   */
  parsedFiles: Map<string, YamlFile>;
  /** YAML alias expansions so far, checked against `limits.maxAliases`. */
  aliasCount: number;
  /** `${file:…}` references followed so far, checked against `limits.maxIncludes`. */
  includeCount: number;
  /**
   * Documents that could not be loaded (header or kind problems), with the
   * kind and id they declare, so links to them do not repeat their problem.
   */
  unloaded: { kind?: string; id: string }[];
}

/** Number of errors reported so far; used to tell whether a step added any. */
export function errorCount(context: LoadContext): number {
  return context.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
}

/**
 * Reads a project file as text, enforcing the size limit.
 * `referredFrom` is where the file was mentioned, for the error location.
 */
export function readProjectFile(
  context: LoadContext,
  path: string,
  referredFrom?: Location,
): string | undefined {
  const knownSize = context.files.size?.(path);
  if (knownSize !== undefined && knownSize > context.limits.maxFileBytes) {
    context.diagnostics.push(tooLarge(context, path, knownSize, referredFrom));
    return undefined;
  }
  const text = context.files.read(path);
  if (text === undefined) {
    context.diagnostics.push(
      error(
        "MISSING_FILE",
        `File not found inside the project: ${path}.`,
        referredFrom,
        "Check the path. It is relative to the file that mentions it.",
      ),
    );
    return undefined;
  }
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > context.limits.maxFileBytes) {
    context.diagnostics.push(tooLarge(context, path, bytes, referredFrom));
    return undefined;
  }
  return text;
}

function tooLarge(context: LoadContext, path: string, bytes: number, referredFrom?: Location) {
  return error(
    "FILE_TOO_LARGE",
    `${path} is ${bytes} bytes; the limit is ${context.limits.maxFileBytes}.`,
    referredFrom,
    "Split the file, or raise limits.maxFileBytes.",
  );
}

/** Reads and parses a YAML file once per load; later calls reuse the result. */
export function readYaml(
  context: LoadContext,
  path: string,
  referredFrom?: Location,
): YamlFile | undefined {
  const cached = context.parsedFiles.get(path);
  if (cached) return cached;
  const text = readProjectFile(context, path, referredFrom);
  const parsed = text === undefined ? undefined : parseYamlFile(path, text, context.diagnostics);
  if (parsed) context.parsedFiles.set(path, parsed);
  return parsed;
}

/** The diagnostics with exact repeats removed, in first-seen order. */
export function uniqueDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = JSON.stringify(diagnostic);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
