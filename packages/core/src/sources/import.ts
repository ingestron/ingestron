// Importing a source file into a connection's metadata document (spec/cli/sources.md,
// section 3). A pure function: it is given the document's text and the file, and writes nothing.
import type { SourceMetadataDoc, SourceTableDoc } from "@ingestron/definitions";
import { byCodePoint } from "../code-point.js";
import { byObject, nameKey, sourceChanges, type SourceChange } from "./changes.js";
import { metadataText, parseMetadata, type MetadataDocument } from "./document.js";
import { isDocumentOf, objectFromPath, projectPath } from "./paths.js";
import { readSourceFile } from "./read-file.js";
import type { SourceReaderName, SourceRecipe } from "./recipe.js";
import type { SourceRead } from "./result.js";

/**
 * What `importSource` is given.
 * @public
 */
export interface SourceImportInput {
  /** The id of the connection whose document is updated. */
  connection: string;
  /** The current text of `sources/<connection>.yaml`; none when there is no document yet. */
  current?: string;
  /**
   * The file's path relative to the project's folder, with `/` (or a Windows `\`); a path that
   * leaves the folder, absolute or with a `..` part, is recorded by the file's name only.
   */
  file: string;
  /** The file's contents, as text or bytes. */
  contents: string | Uint8Array;
  /** The connection's recipe, when it has one. */
  recipe?: SourceRecipe;
  /** The table a file of one table describes (`--object`), when its path does not name it. */
  object?: string;
  /**
   * The objects the connection's flows read. A file under `sources/<connection>/` whose path
   * without its last extension names none of them, and whose whole path names one, describes the
   * whole path: `sources/shop/orders.csv` is `orders.csv`. Without them, it is the path without
   * its last extension.
   */
  flowObjects?: readonly string[];
  /** The environment whose source was read (`--env`). */
  environment?: string;
  /** The time of the import, in ISO 8601, written in UTC to the second; any other text is refused. */
  at: string;
}

/**
 * What an import gives: the document's new text, the tables it changed and the readers' notes.
 * @public
 */
export interface SourceImport {
  /** The new text of `sources/<connection>.yaml`. */
  text: string;
  /** Each table added, removed or changed, in order of `object`; none when nothing changed. */
  changes: SourceChange[];
  /** The readers' notes, such as a type that was not known. */
  notes: string[];
}

/** The readers that read many tables: only their catalog results describe the whole source. */
const manyTables = new Set<SourceReaderName>(["columns", "odata", "openapi", "odcs"]);

/** An ISO 8601 date, or a date and time with an optional zone: `2026-11-12`, `2026-11-12T09:30:00+01:00`. */
const isoTime =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/i;

/** The time as `YYYY-MM-DDTHH:MM:SSZ` in UTC, or undefined when the text is not a time. */
function utcSecond(at: string): string | undefined {
  const parts = isoTime.exec(at);
  const time = new Date(at);
  if (parts === null || Number.isNaN(time.getTime())) return undefined;
  // A day the month does not have, such as 30 February, is not a day.
  const day = new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])));
  if (day.getUTCMonth() !== Number(parts[2]) - 1 || day.getUTCDate() !== Number(parts[3]))
    return undefined;
  return time.toISOString().replace(/\.\d+Z$/, "Z");
}

/** Why the file's tables cannot be imported: none, or the same object twice; else undefined. */
function tablesProblem(file: string, read: SourceRead, caseSensitive: boolean): string | undefined {
  if (read.tables.length === 0) return `${file} describes no tables.`;
  const key = nameKey(caseSensitive);
  const seen = new Set<string>();
  for (const { object } of read.tables) {
    if (seen.has(key(object))) return `${file} describes "${object}" twice.`;
    seen.add(key(object));
  }
  return undefined;
}

/** True when the import reads the whole source, so its catalog tables replace every earlier one. */
function readsWholeSource(input: SourceImportInput, read: SourceRead, file: string): boolean {
  return (
    input.recipe?.kind === "catalog" &&
    read.from === "catalog" &&
    manyTables.has(read.reader) &&
    objectFromPath(file, input.connection) === undefined
  );
}

/** The new document's tables: the earlier ones it keeps and the file's, in order of `object`. */
function mergedTables(
  earlier: readonly SourceTableDoc[],
  fresh: readonly SourceTableDoc[],
  whole: boolean,
  caseSensitive: boolean,
): SourceTableDoc[] {
  const key = nameKey(caseSensitive);
  const replaced = byObject(fresh, key);
  const kept = earlier.filter(
    (table) => !(whole && table.captured.from === "catalog") && !replaced.has(key(table.object)),
  );
  return [...kept, ...fresh].sort((a, b) => byCodePoint(a.object, b.object));
}

/** The file read, or the reasons the import refuses it before reading or once it is read. */
function readFor(
  input: SourceImportInput,
  file: string,
  caseSensitive: boolean,
): SourceRead | { refused: string[] } {
  const { connection, recipe, flowObjects } = input;
  if (isDocumentOf(file, connection))
    return { refused: [`${file} is source metadata already; import the file it was made from.`] };
  const flows = flowObjects && { objects: flowObjects, key: nameKey(caseSensitive) };
  const object = objectFromPath(file, connection, flows) ?? input.object;
  return readSourceFile({
    file,
    contents: input.contents,
    connection,
    ...(recipe !== undefined && { recipe }),
    ...(object !== undefined && { object }),
  });
}

/**
 * What the import starts from, or the reason it refuses before reading the file: the import time
 * in UTC and the current document, none when there is no text, or the refusal when the text is
 * not one.
 */
function startOf(
  input: SourceImportInput,
): { at: string; document?: MetadataDocument } | { refused: string[] } {
  const { connection, current } = input;
  const at = utcSecond(input.at);
  if (at === undefined)
    return { refused: [`The import time "${input.at}" is not an ISO 8601 time.`] };
  if (current === undefined) return { at };
  const document = parseMetadata(current, connection);
  if ("problem" in document)
    return {
      refused: [
        `sources/${connection}.yaml is not the source metadata of "${connection}": ${document.problem}. Correct it, or move it away and import every file again.`,
      ],
    };
  return { at, document };
}

/** The file's tables, each captured now, from the reader's rung, with the recipe and the file. */
function freshTables(
  input: SourceImportInput,
  read: SourceRead,
  file: string,
  at: string,
): SourceTableDoc[] {
  const recipe = input.recipe?.id;
  return read.tables.map(({ object, columns }) => ({
    object,
    captured: {
      at,
      from: read.from,
      ...(recipe !== undefined && { recipe }),
      file,
    },
    columns,
  }));
}

/** The new document: the connection, the environment given or kept, the names and the tables. */
function documentOf(
  input: SourceImportInput,
  current: MetadataDocument | undefined,
  names: SourceMetadataDoc["names"],
  tables: SourceTableDoc[],
): MetadataDocument {
  const environment = input.environment ?? current?.environment;
  return {
    id: input.connection,
    connection: input.connection,
    ...(current?.description !== undefined && { description: current.description }),
    ...(environment !== undefined && { environment }),
    ...(names !== undefined && { names }),
    tables,
  };
}

/**
 * Imports one file into a connection's metadata document: reads it with the connection's recipe
 * and returns the document's new text, each table added, removed or changed, and the readers'
 * notes; or the reasons it refuses. A catalog result for the whole source replaces every table
 * an earlier catalog import wrote; any other file replaces only its own tables. Only names and
 * types are written: no value from a file's rows. It writes nothing.
 * @example importSource({ connection: "erp", file: "sources/erp.catalog.csv", contents, recipe, at: "2026-11-12T09:30:00Z" })
 * @public
 */
export function importSource(input: SourceImportInput): SourceImport | { refused: string[] } {
  const current = startOf(input);
  if ("refused" in current) return current;
  const { at } = current;
  const file = projectPath(input.file);
  const names = input.recipe?.names ?? current.document?.names;
  const caseSensitive = names?.caseSensitive !== false;
  const read = readFor(input, file, caseSensitive);
  if ("refused" in read) return read;
  const problem = tablesProblem(file, read, caseSensitive);
  if (problem !== undefined) return { refused: [problem] };
  const earlier = current.document?.tables ?? [];
  const whole = readsWholeSource(input, read, file);
  const tables = mergedTables(earlier, freshTables(input, read, file, at), whole, caseSensitive);
  const document = documentOf(input, current.document, names, tables);
  const changes = sourceChanges(earlier, tables, caseSensitive);
  return { text: metadataText(document), changes, notes: read.notes };
}
