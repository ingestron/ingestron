// Rename: the edits that change an id everywhere it is used, the names it
// refuses, and the `${file:…}` paths to change when a file or folder moves,
// from the same index as go to definition and references.
import { dirname, posix } from "node:path";
import { occurrences, occurrencesAt, referencesAt } from "./navigation.js";
import type { Project } from "./project.js";

/** The edits that rename the id at the offset everywhere, by file. */
export function renameAt(
  project: Project,
  file: string,
  offset: number,
  name: string,
): Record<string, { range: [number, number]; text: string }[]> | undefined {
  const places = referencesAt(project, file, offset);
  if (places.length === 0) return undefined;
  const edits: Record<string, { range: [number, number]; text: string }[]> = {};
  for (const place of places) (edits[place.file] ??= []).push({ range: place.range, text: name });
  return edits;
}

/**
 * Why the id at the offset cannot be renamed to `name`, or undefined when it
 * can: a blank name, or one that another table or document of the same kind
 * already has, which would leave two definitions with one name.
 */
export function renameProblem(
  project: Project,
  file: string,
  offset: number,
  name: string,
): string | undefined {
  if (name.trim() === "") return "Give a name.";
  const symbols = occurrencesAt(project, file, offset)
    .map((item) => item.symbol)
    .filter((symbol) => !symbol.startsWith("file:"));
  for (const symbol of symbols) {
    const kind = symbol.slice(0, symbol.lastIndexOf(":") + 1);
    const taken = `${kind}${name}`;
    if (taken === symbol) continue;
    if (occurrences(project).some((item) => item.definition && item.symbol === taken))
      return `"${name}" is already ${describe(kind)}. Choose another name.`;
  }
  return undefined;
}

/** `table:` → "the name of a table", `doc:Connection:` → "the id of a Connection". */
function describe(kind: string): string {
  if (kind === "table:") return "the name of a table";
  if (kind === "value:") return "the name of a value";
  return `the id of a ${kind.split(":")[1]}`;
}

/**
 * The edits that keep every `${file:…}` pointing at the same file when the
 * file or folder `from` moves to `to` (project paths with "/"), by file as
 * it is now. A file that moves keeps its own references right too.
 */
export function fileMoveEdits(
  project: Project,
  from: string,
  to: string,
): Record<string, { range: [number, number]; text: string }[]> {
  const moved = (path: string) =>
    path === from ? to : path.startsWith(`${from}/`) ? `${to}${path.slice(from.length)}` : path;
  const edits: Record<string, { range: [number, number]; text: string }[]> = {};
  for (const item of occurrences(project)) {
    if (!item.symbol.startsWith("file:")) continue;
    const target = item.symbol.slice("file:".length);
    const written = (project.files.read(item.file) ?? "").slice(...item.range);
    const text = posix.relative(dirname(moved(item.file)), moved(target));
    if (text !== written && (moved(item.file) !== item.file || moved(target) !== target))
      (edits[item.file] ??= []).push({ range: item.range, text });
  }
  return edits;
}
