// A quick fix and its text edits: the shape every fix of the editor takes, and the edits of a
// definitions fix at line and character positions. Its own module, so that each kind of fix can
// use it without importing the module that gathers them.
import { fixEdits, type Fix } from "@ingestron/config";
import { positionAt, type Position, type Project } from "../project/index.js";

/**
 * One quick fix: its title, the problem it solves, and edits that may span files.
 * @public
 */
export interface QuickFix {
  title: string;
  /** The problem it solves; absent for a refactoring, such as moving a setting. */
  problem?: { code: string; line: number };
  edits: { file: string; range: { start: Position; end: Position }; text: string }[];
  /** A new file to write, for a link to a document that does not exist yet. */
  create?: { file: string; text: string };
}

/** A fix's text edits, at line and character positions. */
export function positioned(project: Project, fix: Fix): QuickFix["edits"] {
  const read = (path: string) => project.files.read(path);
  return fixEdits(fix, read).map(({ file, start, end, text }) => {
    const source = read(file) ?? "";
    return {
      file,
      range: { start: positionAt(source, start), end: positionAt(source, end) },
      text,
    };
  });
}
