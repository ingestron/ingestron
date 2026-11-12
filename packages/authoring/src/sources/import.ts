// Importing a file saved where the source request says, for the editor: the whole texts to write
// (spec/cli/sources.md, sections 3 and 6). The project's files are read open editors first, so
// project.yaml's imports line is added to the text the user is editing.
import { isAbsolute } from "node:path";
import { sourceChangesText, sourceFileFor } from "@ingestron/core";
import { sourceImportFor } from "@ingestron/core/internal";
import { inProject, type Project } from "../project/index.js";

/**
 * What an import writes: each file's whole new text, the changes as text and how many of them
 * break something.
 * @public
 */
export interface SourceImportEdit {
  /** `sources/<connection>.yaml`, then `project.yaml` when its imports change. */
  files: { file: string; text: string }[];
  /** The changes as `ingestron source import` prints them. */
  summary: string;
  /** How many of the changes are breaking: a removed table, or a changed one that breaks. */
  breaking: number;
}

/** What an import is given besides the file. */
export interface SourceImportOptions {
  /** The connection the file describes; by default the one its path names. */
  connection?: string;
  /** The table a file of one table describes, when its path does not name it. */
  object?: string;
  /** The environment to load the project for, and to record in the document. */
  environment?: string;
  /** The time of the import, in ISO 8601. */
  at: string;
}

/** The path relative to the project; an absolute path outside the project as it is. */
function projectPath(project: Project, file: string): string {
  return (isAbsolute(file) ? inProject(project.folder, file) : undefined) ?? file;
}

/** The connection and object a file belongs to, by its path; undefined for any other file. */
export function sourceFileAt(
  project: Project,
  file: string,
): { connection: string; object?: string } | undefined {
  return sourceFileFor(projectPath(project, file));
}

/**
 * Imports one file into its connection's metadata document. Gives the texts to write, or the
 * reasons the import stops; it writes nothing.
 */
export function importSource(
  project: Project,
  file: string,
  contents: Uint8Array,
  options: SourceImportOptions,
): SourceImportEdit | { refused: string[] } {
  const path = projectPath(project, file);
  const connection = options.connection ?? sourceFileFor(path)?.connection;
  if (connection === undefined) return { refused: ["Name the connection this file describes."] };
  const { object, environment, at } = options;
  const result = sourceImportFor(project.files, {
    connection,
    file: path,
    contents,
    at,
    ...(object !== undefined && { object }),
    ...(environment !== undefined && { environment }),
  });
  if ("problems" in result) return { refused: result.problems };
  const { document, imported } = result;
  return {
    files: [
      { file: document, text: imported.text },
      ...(result.project !== undefined ? [{ file: "project.yaml", text: result.project }] : []),
    ],
    summary: sourceChangesText(connection, imported.changes, imported.notes),
    breaking: imported.changes.filter(({ breaking }) => breaking).length,
  };
}
