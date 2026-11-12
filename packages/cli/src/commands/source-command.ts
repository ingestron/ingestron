// ingestron source request and ingestron source import (spec/cli/sources.md, section 6). The rules
// are @ingestron/core's: this reads the files, calls it, writes and prints.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { formatDiagnostics, nodeFiles, resolveProject, type FileSource } from "@ingestron/config";
import {
  importSource,
  sourceChangesText,
  sourceOrigin,
  sourceRecipes,
  withSourcesImport,
  type SourceImport,
  type SourceRecipe,
} from "@ingestron/core";
import { environmentsToGenerate, notAConnection, sourceRequestFor } from "@ingestron/core/internal";
import { kinds } from "@ingestron/definitions";
import type { Io, Options, SourceAction } from "../terminal/index.js";

type Import = Extract<SourceAction, { action: "import" }>;

/** The exit code of a command that stopped, after printing why. */
interface Stopped {
  code: number;
}

/** Prints the source request, or imports a file into a connection's metadata. Returns the exit code. */
export function source(options: Options, io: Io): number {
  const action = options.source!;
  if (action.action === "import") return importFile(options, action, io);
  const files = nodeFiles(resolve(io.cwd, options.definitions));
  const request = sourceRequestFor(files, options.environments[0], {
    ...(action.connection !== undefined && { connection: action.connection }),
  });
  io.write(request.text);
  return request.resolved ? 0 : 1;
}

/** The file's path as the import records it: relative to the project's folder, with `/`. */
function projectRelative(file: string, io: Io, definitions: string): string {
  const path = relative(definitions, resolve(io.cwd, file));
  const outside = path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path);
  return outside ? file : path.split(sep).join("/");
}

/** Prints each reason on a line of its own. */
function stop(io: Io, reasons: readonly string[]): Stopped {
  io.write(reasons.map((reason) => `${reason}\n`).join(""));
  return { code: 1 };
}

/** The connection's recipe, from the installed ones and the project's own, and the problems with it. */
function recipeOf(
  connection: { id: string; connector: string; metadata?: { from: string } },
  files: FileSource,
): { recipe?: SourceRecipe; problems: string[] } {
  try {
    const { recipe, problems } = sourceOrigin(connection, sourceRecipes(files));
    return { ...(recipe && { recipe }), problems };
  } catch (error) {
    return { problems: [error instanceof Error ? error.message : String(error)] };
  }
}

/**
 * The connection's recipe, once the project's documents are loaded (not resolved, so a project
 * with no columns yet can be imported into) and the connection is one of them.
 */
function recipeForImport(
  files: FileSource,
  connection: string,
  environment: string | undefined,
  io: Io,
): { recipe?: SourceRecipe } | Stopped {
  const loaded = resolveProject(files, {
    kinds: Object.values(kinds),
    ...(environment !== undefined && { environment }),
    envvars: process.env,
    missingEnvvars: "information",
  });
  if (!loaded.ok) return stop(io, [formatDiagnostics(loaded.diagnostics)]);
  const connections = loaded.project.all(kinds.connection).map(({ value }) => value);
  const found = connections.find(({ id }) => id === connection);
  if (found === undefined)
    return stop(io, [
      notAConnection(
        connection,
        connections.map(({ id }) => id),
      ),
    ]);
  const { recipe, problems } = recipeOf(found, files);
  return problems.length > 0 ? stop(io, problems) : { ...(recipe && { recipe }) };
}

/** project.yaml with the document added to its imports; undefined when an import matches already. */
function projectWithImport(
  definitions: string,
  document: string,
  io: Io,
): string | undefined | Stopped {
  try {
    return withSourcesImport(readFileSync(join(definitions, "project.yaml"), "utf8"), document);
  } catch (error) {
    return stop(io, [error instanceof Error ? error.message : String(error)]);
  }
}

/** True when the path is a file (not a folder, and there). */
function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

/** source import: nothing is written unless the whole import can be. */
function importFile(options: Options, action: Import, io: Io): number {
  const definitions = resolve(io.cwd, options.definitions);
  const environment = options.environments[0];
  const files = nodeFiles(definitions);
  // Only the connections are read, the same in every environment, so a project whose values
  // differ by environment loads for the first one it declares; `environment` is recorded only
  // when --env gave it.
  const loadedFor = environment ?? environmentsToGenerate(definitions, [])[0];
  const origin = recipeForImport(files, action.connection, loadedFor, io);
  if ("code" in origin) return origin.code;
  const path = resolve(io.cwd, action.file);
  if (!isFile(path)) return stop(io, [`There is no file ${action.file}.`]).code;
  const document = `sources/${action.connection}.yaml`;
  const existing = join(definitions, document);
  const imported = importSource({
    connection: action.connection,
    ...(existsSync(existing) && { current: readFileSync(existing, "utf8") }),
    file: projectRelative(action.file, io, definitions),
    contents: readFileSync(path),
    ...origin,
    ...(action.object !== undefined && { object: action.object }),
    ...(environment !== undefined && { environment }),
    at: (io.now?.() ?? new Date()).toISOString(),
  });
  if ("refused" in imported) return stop(io, imported.refused).code;
  return finish({ action, definitions, document, imported }, io);
}

/** Prints the changes and, unless --dry-run, writes the document and the import. */
function finish(
  done: { action: Import; definitions: string; document: string; imported: SourceImport },
  io: Io,
): number {
  const { action, definitions, document, imported } = done;
  const project = projectWithImport(definitions, document, io);
  if (typeof project === "object") return project.code;
  io.write(sourceChangesText(action.connection, imported.changes, imported.notes));
  if (action.dryRun) {
    io.write("Nothing was written (--dry-run).\n");
    return 0;
  }
  const target = join(definitions, document);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, imported.text);
  io.write(`Wrote ${document}.\n`);
  if (project === undefined) return 0;
  writeFileSync(join(definitions, "project.yaml"), project);
  io.write(`Added ${document} to the imports of project.yaml.\n`);
  return 0;
}
