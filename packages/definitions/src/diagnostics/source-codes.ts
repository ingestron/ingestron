// Help for the codes about source metadata (specification section 12), shown on the
// documentation site with the others.
import type { CodeHelp } from "./code-help.js";
import type { DefinitionCode } from "./diagnostics.js";

/** What each code means and how to fix it. */
export const sourceCodeHelp: Record<
  Extract<
    DefinitionCode,
    "SOURCE_METADATA_DUPLICATE" | "SOURCE_OBJECT_AMBIGUOUS" | "TABLE_NO_COLUMNS"
  >,
  CodeHelp
> = {
  SOURCE_METADATA_DUPLICATE: {
    meaning:
      "A connection has more than one SourceMetadata document. The first, in the order the documents are loaded, is used.",
    fix: "Keep one document for the connection, with all its tables.",
    severities: ["error"],
    origin: "resolve",
  },
  SOURCE_OBJECT_AMBIGUOUS: {
    meaning:
      "A flow table's object matches more than one table of the source metadata for its connection, such as Customers in two schemas.",
    fix: "Write more of the object's name, such as its schema (dbo.Customers), so that it matches one table.",
    severities: ["error"],
    origin: "resolve",
  },
  TABLE_NO_COLUMNS: {
    meaning:
      "A flow table names no contract, and the project has no source metadata entry for its object, so nothing says what its columns are.",
    fix: "Import the source's metadata (ingestron source request says how), or name a contract.",
    severities: ["error"],
    origin: "resolve",
  },
};
