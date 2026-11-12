// `ingestron source import` without the files: the project loaded for its connections, the
// connection's recipe, the import itself and project.yaml's imports (spec/cli/sources.md,
// sections 3 and 6). The command line and the editor read the file and write the results.
import { formatDiagnostics, resolveProject, type FileSource } from "@ingestron/config";
import { kinds } from "@ingestron/definitions";
import { sourceEnvironment } from "./environment.js";
import { importSource, type SourceImport } from "./import.js";
import { withSourcesImport } from "./imports.js";
import type { SourceRecipe } from "./recipe.js";
import { sourceOrigin, sourceRecipes } from "./recipes.js";
import { notAConnection } from "./request.js";

/**
 * What `sourceImportFor` is given.
 * @internal
 */
export interface SourceImportRequest {
  /** The id of the connection whose document is updated. */
  connection: string;
  /**
   * The file's path relative to the project's folder, written with `/` or `\`; a path that leaves
   * the folder (absolute, or with a `..` part) is recorded by the file's name only.
   */
  file: string;
  /** The file's contents, as text or bytes. */
  contents: string | Uint8Array;
  /** The table a file of one table describes (`--object`), when its path does not name it. */
  object?: string;
  /** The environment `--env` names: loaded for, and recorded in the document. */
  environment?: string;
  /** The time of the import, in ISO 8601. */
  at: string;
  /** The folder of the installed recipes; by default the one `sourceRecipes` finds. */
  recipesRoot?: string;
  /** The environment variables; by default the process's. */
  envvars?: Record<string, string | undefined>;
}

/**
 * What an import gives the caller to write: the document's path and the import, and project.yaml's
 * new text when the document was added to its imports.
 * @internal
 */
export interface SourceImportResult {
  /** `sources/<connection>.yaml`, relative to the project's folder. */
  document: string;
  imported: SourceImport;
  /** project.yaml with the document added to its imports; none when an import matches it already. */
  project?: string;
}

/** The reasons the import stops, each a message for a line of its own. */
type Problems = { problems: string[] };

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * The connection's recipe, once the project's documents are loaded (not resolved, so a project
 * with no columns yet can be imported into), tolerating a reference set nowhere, for the
 * environment given or else the first one project.yaml declares.
 */
function recipeFor(
  files: FileSource,
  request: SourceImportRequest,
): { recipe?: SourceRecipe } | Problems {
  const { environment } = sourceEnvironment(files, request.environment);
  const loaded = resolveProject(files, {
    kinds: Object.values(kinds),
    ...(environment !== undefined && { environment }),
    envvars: request.envvars ?? process.env,
    missingEnvvars: "information",
  });
  if (!loaded.ok) return { problems: [formatDiagnostics(loaded.diagnostics)] };
  const connections = loaded.project.all(kinds.connection).map(({ value }) => value);
  const found = connections.find(({ id }) => id === request.connection);
  if (found === undefined)
    return {
      problems: [
        notAConnection(
          request.connection,
          connections.map(({ id }) => id),
        ),
      ],
    };
  try {
    const { recipe, problems } = sourceOrigin(found, sourceRecipes(files, request.recipesRoot));
    return problems.length > 0 ? { problems } : { ...(recipe && { recipe }) };
  } catch (error) {
    return { problems: [messageOf(error)] };
  }
}

/**
 * Imports one file into a connection's metadata document, as `ingestron source import` does: the
 * connection must be the project's, and its recipe sound; the document's current text is read
 * from `files`. Gives what to write, or the reasons the import stops. It writes nothing.
 * @internal
 */
export function sourceImportFor(
  files: FileSource,
  request: SourceImportRequest,
): SourceImportResult | Problems {
  const origin = recipeFor(files, request);
  if ("problems" in origin) return origin;
  const { connection, file, contents, object, environment, at } = request;
  const document = `sources/${connection}.yaml`;
  const current = files.read(document);
  const imported = importSource({
    connection,
    ...(current !== undefined && { current }),
    file,
    contents,
    ...origin,
    ...(object !== undefined && { object }),
    ...(environment !== undefined && { environment }),
    at,
  });
  if ("refused" in imported) return { problems: imported.refused };
  try {
    const project = withSourcesImport(files.read("project.yaml") ?? "", document);
    return { document, imported, ...(project !== undefined && { project }) };
  } catch (error) {
    return { problems: [messageOf(error)] };
  }
}
