// The whole pipeline, in order:
//   manifest → imported paths → each document (resolve, header, kind, schema)
//   → duplicate ids → links → result

import { holdsUnsetEnvvar, uniqueDiagnostics, type LoadContext } from "../resolve/index.js";
import { hasErrors, type Diagnostic } from "../diagnostics/index.js";
import { envvarsFor } from "./env-files.js";
import { checkDuplicateIds, loadDocument, type LoadedDocument } from "../resolve/index.js";
import type { FileSource } from "../files/index.js";
import type { KindDefinition } from "../kinds/index.js";
import { defaultLimits, type Limits } from "../files/index.js";
import { checkLinks } from "./links.js";
import { importedPaths, readManifest } from "./manifest.js";
import { createProject, type Project } from "../resolve/index.js";
import { createSchemaChecker } from "../validate/index.js";

/** Options for {@link resolveProject} and `loadProject`. */
export interface LoadOptions {
  /** The kinds of document the project may contain. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any kind's document type is accepted
  kinds: readonly KindDefinition<any>[];
  /** Environment whose values are merged over the defaults. */
  environment?: string;
  /**
   * The host environment for `${envvar:…}`. `loadProject` defaults to
   * `process.env`; `resolveProject` to none. Empty values count as unset.
   * `.env.<environment>` and `.env` in the project root fill what it lacks.
   */
  envvars?: Readonly<Record<string, string | undefined>>;
  /**
   * What a `${envvar:…}` that is set nowhere is. `"error"` (the default) stops
   * the load. `"information"` reports it as information and resolves the
   * reference to its own text, so an editor can still show the project.
   */
  missingEnvvars?: "error" | "information";
  /**
   * True when whatever deploys the result supplies every `${envvar:…}`: each
   * reference resolves to its own text, `${envvar:NAME}`, without reading the
   * host environment or the environment files, and without a diagnostic
   * (spec/config/syntax.md §4.4). `missingEnvvars` is then not used.
   */
  deployEnvvars?: boolean;
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
  const context = createLoadContext(files, options);
  const manifest = readManifest(context, options.manifest ?? "project.yaml", options.environment);
  if (!manifest) return failure(context);

  const checkSchema = createSchemaChecker();
  const loaded = importedPaths(context, manifest)
    .map((path) => loadDocument(context, path, manifest.scope, options.kinds, checkSchema))
    .filter((document): document is LoadedDocument => document !== undefined);
  checkDuplicateIds(loaded, context.diagnostics);
  checkLinks(loaded, context.diagnostics, context.unloaded, (text) =>
    holdsUnsetEnvvar(context, text),
  );

  if (hasErrors(context.diagnostics)) return failure(context);
  const project = createProject(
    manifest.scope,
    loaded.map(({ document }) => document),
    manifest.runsOn,
    { unset: [...context.unsetEnvvars], references: [...context.envvarReferences.values()] },
  );
  return { ok: true, project, diagnostics: uniqueDiagnostics(context.diagnostics) };
}

/** A load's starting state, with the variables `.env` files and the host give. */
function createLoadContext(files: FileSource, options: LoadOptions): LoadContext {
  const limits = { ...defaultLimits, ...options.limits };
  // Values supplied when deploying are never read here, so neither are their sources.
  const { envvars, setIn, diagnostics } = options.deployEnvvars
    ? { envvars: {}, setIn: {}, diagnostics: [] }
    : envvarsFor(files, options.environment, options.envvars ?? {}, limits.maxFileBytes);
  return {
    files,
    limits,
    envvars,
    envvarsSetIn: setIn,
    missingEnvvars: options.missingEnvvars ?? "error",
    deployEnvvars: options.deployEnvvars ?? false,
    environment: options.environment,
    diagnostics,
    unsetEnvvars: new Set(),
    envvarReferences: new Map(),
    parsedFiles: new Map(),
    aliasCount: 0,
    includeCount: 0,
    unloaded: [],
  };
}

function failure(context: LoadContext): LoadResult {
  return { ok: false, diagnostics: uniqueDiagnostics(context.diagnostics) };
}
