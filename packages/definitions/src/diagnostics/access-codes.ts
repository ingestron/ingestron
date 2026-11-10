// Help for the codes about who may use each table and what is hidden from them
// (specification section 8.2), shown on the documentation site with the others.
import type { CodeHelp } from "./code-help.js";
import type { DefinitionCode } from "./diagnostics.js";

/** What each code means and how to fix it. */
export const accessCodeHelp: Record<
  Extract<DefinitionCode, "ROLE_ACCESS" | "MASK_TYPE" | "FILTER_MATCH">,
  CodeHelp
> = {
  ROLE_ACCESS: {
    meaning: "A contract role's access is neither read nor write, so it cannot be granted.",
    fix: "Write read, or write for read and write. Leave it out to read.",
    severities: ["error"],
    origin: "resolve",
  },
  MASK_TYPE: {
    meaning:
      "The standard masks a classification with hash or redact, which work on text, and a column with that classification is not text.",
    fix: "Mask that classification with null or a function of your own, or classify the column differently.",
    severities: ["error"],
    origin: "resolve",
  },
  FILTER_MATCH: {
    meaning:
      "A row filter of the standard matches more than one column of a table; it is given exactly one.",
    fix: "Narrow the filter's match, such as with a tag value, or tag only one of the columns.",
    severities: ["error"],
    origin: "resolve",
  },
};
