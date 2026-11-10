// Help for the codes about a table's cleansing and deduplicate (specification sections 6.1
// and 6.2), shown on the documentation site with the others.
import type { DefinitionCode } from "./diagnostics.js";

/** What each code means and how to fix it. */
export const cleanseCodeHelp: Record<
  Extract<
    DefinitionCode,
    "CLEANSE_COLUMN" | "CLEANSE_TYPE" | "DEDUPLICATE_KEY" | "DEDUPLICATE_MODE"
  >,
  { meaning: string; fix: string }
> = {
  CLEANSE_COLUMN: {
    meaning:
      "A cleansed column, or a deduplicate order_by column, is not a column of the table's contract.",
    fix: "Use a column that the contract lists, or add the column to the contract.",
  },
  CLEANSE_TYPE: {
    meaning:
      "A cleansing operation does not fit the column's type in the table's contract: trim, empty or case on a column that is not text, or a default or map value that is not of the column's type. The type is the one after the cast, so a column that is text in one table and a number in the next is a number in the second.",
    fix: "Remove the operation, cleanse the column in the table where it is still text, or give a value of the column's type.",
  },
  DEDUPLICATE_KEY: {
    meaning:
      "A table deduplicates, but its contract has no primary key to say which rows belong together.",
    fix: "Mark the key columns with primaryKey: true in the contract.",
  },
  DEDUPLICATE_MODE: {
    meaning:
      "Deduplicate does not fit how the table is kept. As an error: the store appends rows, and rows already kept cannot be deduplicated. As a warning: the table's history already decides what is kept for each key, so deduplicate adds nothing.",
    fix: "Set history: latest to keep one row per key, deduplicate in a transform that reads the table, or remove deduplicate.",
  },
};
