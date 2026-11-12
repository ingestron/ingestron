// What a reader gives back, and what each reader is given. The rules are in
// spec/cli/sources.md, section 2.
import type { SourceColumnDoc } from "@ingestron/definitions";
import type { SourceReaderName, SourceRecipe } from "./recipe.js";
import type { ParseResult, XmlResult } from "./text.js";

/**
 * Where a table's columns came from, as a metadata document records it (`captured.from`).
 * @internal
 */
export type CapturedFrom = "catalog" | "document" | "sample" | "columns" | "assistant";

/**
 * One table a reader found: its `object` and its columns.
 * @internal
 */
export interface SourceTableRead {
  object: string;
  columns: SourceColumnDoc[];
}

/**
 * What a reader read from one file.
 * @internal
 */
export interface SourceRead {
  /** The reader that read the file. */
  reader: SourceReaderName;
  /** Which rung of the ladder the tables are from. */
  from: CapturedFrom;
  /** The tables, in the order the file gives them. */
  tables: SourceTableRead[];
  /** Information that does not stop the import, such as a type that was not known. */
  notes: string[];
}

/** The reasons a reader refuses a file. */
export interface Refused {
  refused: string[];
}

/** What a reader gives back: tables and notes, or the reasons it refuses the file. */
export type Outcome = { tables: SourceTableRead[]; notes: string[] } | Refused;

/** A file as a reader is given it. */
export interface ReaderInput {
  /** The path relative to the project, with `/`. */
  file: string;
  /** The file's bytes. */
  bytes: Uint8Array;
  /** The text of the file, UTF-8 without a byte-order mark; empty for a Parquet file. */
  text: string;
  /** The file's text as JSON, parsed the first time it is asked for and shared by every reader. */
  json(): ParseResult;
  /** The file's text as YAML, parsed the first time it is asked for. */
  yaml(): ParseResult;
  /** The file's text as XML, parsed the first time it is asked for. */
  xml(): XmlResult;
  /** The recipe, with the fields the reader may use. */
  recipe?: SourceRecipe;
  /** The table a reader of one table describes, when it is known. */
  object?: string;
}

/** A reader: whether it takes a file in its format, and what it reads from it. */
export interface Reader {
  accepts(input: ReaderInput): boolean;
  read(input: ReaderInput): Outcome;
}

/** True when the outcome is a refusal. */
export function isRefused(outcome: Outcome | SourceRead): outcome is Refused {
  return "refused" in outcome;
}
