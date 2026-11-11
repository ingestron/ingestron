// Help for the codes about source metadata (specification section 12), shown on the
// documentation site with the others.
import type { CodeHelp } from "./code-help.js";
import type { DefinitionCode } from "./diagnostics.js";

/**
 * The codes for a difference between a contract and the source's metadata (specification
 * section 12.6). The breaking ones are errors, or warnings that `accept` can accept when
 * `sources.breaking` is `warn`; the compatible ones are information.
 * @public
 */
export type SourceCode = Extract<
  DefinitionCode,
  | "SOURCE_COLUMN_NEW"
  | "SOURCE_COLUMN_GONE"
  | "SOURCE_TYPE_CHANGED"
  | "SOURCE_TYPE_FITS"
  | "SOURCE_NULLABLE"
  | "SOURCE_KEY_CHANGED"
  | "SOURCE_TABLE_GONE"
>;

/** What each code means and how to fix it. */
export const sourceCodeHelp: Record<
  | SourceCode
  | Extract<
      DefinitionCode,
      | "SOURCE_METADATA_DUPLICATE"
      | "SOURCE_OBJECT_AMBIGUOUS"
      | "TABLE_NO_COLUMNS"
      | "CONTRACT_NEEDED"
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
  CONTRACT_NEEDED: {
    meaning:
      "A flow table names no contract, but needs one: its layer cleanses, checks or quarantines, access is managed for it, or it has expectations of its own. Source metadata does not stand in for a contract here.",
    fix: "Name a contract for the table with contract. Or, for managed access, set access: { contract: false } on its layer.",
    severities: ["error"],
    origin: "resolve",
  },
  SOURCE_COLUMN_NEW: {
    meaning:
      "The source's metadata has a column that the table's contract does not have. Nothing breaks, since the contract's columns are all still there.",
    fix: "Add the column to the contract to use it, or leave it out.",
    severities: ["information"],
    origin: "resolve",
  },
  SOURCE_COLUMN_GONE: {
    meaning:
      "A column of the table's contract is not in the source's metadata, so the data would stop landing. It is an error, or a warning when sources.breaking is warn.",
    fix: "Remove the column from the contract, or import the source's metadata again if the column is still there. A warning can be accepted in the Platform's accept list.",
    severities: ["error", "warning"],
    origin: "resolve",
  },
  SOURCE_TYPE_CHANGED: {
    meaning:
      "A column's type in the source's metadata does not fit the type in the table's contract, so values could be lost or rejected. It is an error, or a warning when sources.breaking is warn.",
    fix: "Change the column's type in the contract to one the source's type fits, or ask the source's owner about the change. A warning can be accepted in the Platform's accept list.",
    severities: ["error", "warning"],
    origin: "resolve",
  },
  SOURCE_TYPE_FITS: {
    meaning:
      "A column's type in the source's metadata differs from the type in the table's contract, but every value of it is a value of the contract's.",
    fix: "Nothing breaks. Change the contract to the source's type if you want it exact.",
    severities: ["information"],
    origin: "resolve",
  },
  SOURCE_NULLABLE: {
    meaning:
      "A column that the table's contract requires can be null in the source's metadata. It is an error, or a warning when sources.breaking is warn.",
    fix: "Make the column not required in the contract, or ask the source's owner whether it can be null. A warning can be accepted in the Platform's accept list.",
    severities: ["error", "warning"],
    origin: "resolve",
  },
  SOURCE_KEY_CHANGED: {
    meaning:
      "The primary key in the source's metadata is not the contract's. It is an error, or a warning when sources.breaking is warn.",
    fix: "Change the contract's primary key to the source's, or ask the source's owner about the change. A warning can be accepted in the Platform's accept list.",
    severities: ["error", "warning"],
    origin: "resolve",
  },
  SOURCE_TABLE_GONE: {
    meaning:
      "A flow table's object is not in the source's metadata, which was imported from a catalog that lists the whole source. It is an error, or a warning when sources.breaking is warn.",
    fix: "Check the object's name, or import the source's metadata again if the table was added since. A warning can be accepted in the Platform's accept list.",
    severities: ["error", "warning"],
    origin: "resolve",
  },
};
