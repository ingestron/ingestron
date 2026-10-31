// `@ingestron/config`: the core API plus loading from a folder on disk (Node).

import { resolveProject, type LoadOptions, type LoadResult } from "./load.js";
import { nodeFiles } from "./node-files.js";

export * from "./core.js";
export { nodeFiles } from "./node-files.js";

/**
 * Loads the project in `folder`, reading `${envvar:…}` from `process.env`
 * unless `options.envvars` is given.
 * @example
 * const result = loadProject("./definitions", { kinds: [pipeline], environment: "dev" });
 * if (!result.ok) {
 *   console.error(formatDiagnostics(result.diagnostics));
 *   process.exit(1);
 * }
 */
export function loadProject(folder: string, options: LoadOptions): LoadResult {
  return resolveProject(nodeFiles(folder), { ...options, envvars: options.envvars ?? process.env });
}
