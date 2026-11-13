// ingestron source request and ingestron source import (spec/cli/sources.md, section 6). The rules
// are @ingestron/core's: this reads the files, calls it, writes and prints.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { nodeFiles } from "@ingestron/config";
import { sourceChangesText } from "@ingestron/core";
import {
  sourceImportFor,
  sourceRequestFor,
  type SourceImportResult,
} from "@ingestron/core/internal";
import type { Io, Options, SourceAction } from "../terminal/index.js";
import { WriteRefused, writeStaged } from "./write-staged.js";

type Import = Extract<SourceAction, { action: "import" }>;

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

/** Prints each reason on a line of its own; the exit code of a refusal. */
function stop(io: Io, reasons: readonly string[]): number {
  io.write(reasons.map((reason) => `${reason}\n`).join(""));
  return 1;
}

/** True when the path is a file (not a folder, and there). */
function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

/** source import: nothing is written unless the whole import can be. */
function importFile(options: Options, action: Import, io: Io): number {
  const definitions = resolve(io.cwd, options.definitions);
  const environment = options.environments[0];
  const path = resolve(io.cwd, action.file);
  if (!isFile(path)) return stop(io, [`There is no file ${action.file}.`]);
  const result = sourceImportFor(nodeFiles(definitions), {
    connection: action.connection,
    file: relative(definitions, path),
    contents: readFileSync(path),
    ...(action.object !== undefined && { object: action.object }),
    ...(environment !== undefined && { environment }),
    at: (io.now?.() ?? new Date()).toISOString(),
  });
  if ("problems" in result) return stop(io, result.problems);
  return finish(action, definitions, result, io);
}

/**
 * The refusal an error from writing is, naming the path from the project folder; an error that
 * the system gave a code to is one too (a file or folder that cannot be written), naming the
 * document the import writes when it carries no path, and anything else is thrown again.
 */
function refusal(error: unknown, definitions: string, document: string): string {
  const { code, path } = error as NodeJS.ErrnoException;
  const shown = (file: string): string => relative(definitions, file).split(sep).join("/");
  if (error instanceof WriteRefused) return error.text(shown);
  if (code === undefined) throw error;
  return WriteRefused.say(shown(path ?? join(definitions, document)), code);
}

/** Prints the changes and, unless --dry-run, writes the document and the import. */
function finish(action: Import, definitions: string, result: SourceImportResult, io: Io): number {
  const { document, imported, project } = result;
  const changes = sourceChangesText(action.connection, imported.changes, imported.notes);
  if (action.dryRun) {
    io.write(`${changes}Nothing was written (--dry-run).\n`);
    return 0;
  }
  // The document and project.yaml are written together, so a failure leaves neither half written.
  // The changes are printed only once they are written, so a refused import prints none.
  try {
    writeStaged([
      { file: join(definitions, document), text: imported.text },
      ...(project === undefined
        ? []
        : [{ file: join(definitions, "project.yaml"), text: project }]),
    ]);
  } catch (error) {
    return stop(io, [refusal(error, definitions, document)]);
  }
  io.write(changes);
  io.write(`Wrote ${document}.\n`);
  if (project !== undefined) io.write(`Added ${document} to the imports of project.yaml.\n`);
  return 0;
}
