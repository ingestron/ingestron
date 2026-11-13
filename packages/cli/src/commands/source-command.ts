// ingestron source request and ingestron source import (spec/cli/sources.md, section 6). The rules
// are @ingestron/core's: this reads the files, calls it, writes and prints.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
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

/** Prints the changes and, unless --dry-run, writes the document and the import. */
function finish(action: Import, definitions: string, result: SourceImportResult, io: Io): number {
  const { document, imported, project } = result;
  io.write(sourceChangesText(action.connection, imported.changes, imported.notes));
  if (action.dryRun) {
    io.write("Nothing was written (--dry-run).\n");
    return 0;
  }
  // The document and project.yaml are written together, so a failure leaves neither half written.
  try {
    writeStaged([
      { file: join(definitions, document), text: imported.text },
      ...(project === undefined
        ? []
        : [{ file: join(definitions, "project.yaml"), text: project }]),
    ]);
  } catch (error) {
    if (error instanceof WriteRefused) return stop(io, [error.message]);
    throw error;
  }
  io.write(`Wrote ${document}.\n`);
  if (project !== undefined) io.write(`Added ${document} to the imports of project.yaml.\n`);
  return 0;
}
