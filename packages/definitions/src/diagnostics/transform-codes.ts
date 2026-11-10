// Help for the codes about a transform's code and columns (specification section 5), shown on
// the documentation site with the others.
import type { Severity } from "@ingestron/config";
import type { DefinitionCode } from "./diagnostics.js";

/** What each code means and how to fix it. */
export const transformCodeHelp: Record<
  Extract<DefinitionCode, "TRANSFORM_CODE" | "TRANSFORM_COLUMNS">,
  { meaning: string; fix: string; severities: readonly Severity[] }
> = {
  TRANSFORM_CODE: {
    meaning:
      "A transform has no code and does not have exactly one input. Only a transform with one input can leave its code out.",
    fix: "Write the code, or give the transform one input.",
    severities: ["error"],
  },
  TRANSFORM_COLUMNS: {
    meaning:
      "A transform's query returns a column its contract does not name, or does not return one the contract names. A warning; it is checked only when the query's columns can be read from its outermost SELECT.",
    fix: "Add the column to the contract, or change the query to return the contract's columns.",
    severities: ["warning"],
  },
};
