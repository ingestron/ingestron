// The whole pipeline, in order:
//   manifest → imported paths → each document (resolve, header, kind, schema)
//   → duplicate ids → links → result

import { uniqueDiagnostics, type LoadContext } from "./context.js";
import { hasErrors, type Diagnostic } from "./diagnostics.js";
import { checkDuplicateIds, loadDocument, type LoadedDocument } from "./documents.js";
import type { FileSource } from "./files.js";
import type { KindDefinition } from "./kinds.js";
import { defaultLimits, type Limits } from "./limits.js";
import { checkLinks } from "./links.js";
import { importedPaths, readManifest } from "./manifest.js";
import { createProject, type Project } from "./project.js";
import { createSchemaChecker } from "./validate.js";

/** Options for {@link resolveProject} and `loadProject`. */
export interface LoadOptions {
  /** The kinds of document the project may contain. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any kind's document type is accepted
  kinds: readonly KindDefinition<any>[];
  /** Environment whose values are merged over the defaults. */
  environment?: string;
  /** Variables for `${envvar:…}`. `loadProject` defaults to `process.env`; `resolveProject` to none. */
  envvars?: Readonly<Record<string, string | undefined>>;
  /** Manifest path inside the project. Default: "project.yaml". */
  manifest?: string;
  /** Overrides for {@link defaultLimits}. */
  limits?: Partial<Limits>;
}

/**
 * The outcome of a load. `ok` is true when there are no errors; warnings may
 * still be present in `diagnostics`.
 */
export type LoadResult =
  | { ok: true; project: Project; diagnostics: Diagnostic[] }
  | { ok: false; project?: undefined; diagnostics: Diagnostic[] };

/**
 * Loads a project from any {@link FileSource}. Use this in browsers, editors
 * and tests; in Node, `loadProject(folder, options)` is shorter.
 * @example
 * const result = resolveProject(memoryFiles(files), { kinds: [pipeline] });
 * if (!result.ok) console.error(formatDiagnostics(result.diagnostics));
 */
export function resolveProject(files: FileSource, options: LoadOptions): LoadResult {
  const context: LoadContext = {
    files,
    limits: { ...defaultLimits, ...options.limits },
    envvars: options.envvars ?? {},
    diagnostics: [],
    parsedFiles: new Map(),
    aliasCount: 0,
    includeCount: 0,
    unloaded: [],
  };
  const manifest = readManifest(context, options.manifest ?? "project.yaml", options.environment);
  if (!manifest) return failure(context);

  const checkSchema = createSchemaChecker();
  const loaded = importedPaths(context, manifest)
    .map((path) => loadDocument(context, path, manifest.scope, options.kinds, checkSchema))
    .filter((document): document is LoadedDocument => document !== undefined);
  checkDuplicateIds(loaded, context.diagnostics);
  checkLinks(loaded, context.diagnostics, context.unloaded);

  if (hasErrors(context.diagnostics)) return failure(context);
  const project = createProject(
    manifest.scope,
    loaded.map(({ document }) => document),
    manifest.runsOn,
  );
  return { ok: true, project, diagnostics: uniqueDiagnostics(context.diagnostics) };
}

function failure(context: LoadContext): LoadResult {
  return { ok: false, diagnostics: uniqueDiagnostics(context.diagnostics) };
}
