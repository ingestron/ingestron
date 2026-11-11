// Help for the codes about who may use each table and what is hidden from them
// (specification section 8.2), shown on the documentation site with the others.
import type { CodeHelp } from "./code-help.js";
import type { DefinitionCode } from "./diagnostics.js";

/** What each code means and how to fix it. */
export const accessCodeHelp: Record<
  Extract<
    DefinitionCode,
    | "ROLE_ACCESS"
    | "MASK_TYPE"
    | "FILTER_MATCH"
    | "FILTER_MULTIPLE"
    | "MASK_NEEDS_RUN_AS"
    | "MASK_FUNCTIONS"
    | "POLICY_LIMIT"
    | "POLICY_PRINCIPALS"
  >,
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
  FILTER_MULTIPLE: {
    meaning:
      "Two or more row filters apply to one table, and a table may have one: on Databricks, a query fails when more than one distinct row filter applies to a table.",
    fix: "Combine their conditions in one filter function, or narrow their matches so each table has one.",
    severities: ["error"],
    origin: "resolve",
  },
  MASK_NEEDS_RUN_AS: {
    meaning:
      "Masks or row filters are on, and the platform gives no run_as. Every mask and filter lets run_as see real values, so the pipeline never reads masked data and writes it on.",
    fix: "Give run_as, the principal the pipeline runs as, in the pack's section of the platform.",
    severities: ["error"],
    origin: "resolve",
  },
  MASK_FUNCTIONS: {
    meaning:
      "A built-in mask, or a mask or filter function named in one part, needs a schema to hold it, and the platform gives none.",
    fix: "Give governance.functions, the schema the functions are in, in the pack's section of the platform.",
    severities: ["error"],
    origin: "resolve",
  },
  POLICY_LIMIT: {
    meaning:
      "The masks and row filters would need more policies than the platform allows: 100 on a schema, or 50 on a table.",
    fix: "Mask fewer classifications, or use fewer filters.",
    severities: ["error"],
    origin: "resolve",
  },
  POLICY_PRINCIPALS: {
    meaning:
      "Together, run_as and governance.unmasked name more principals than one policy can let see real values: 20.",
    fix: "Put the principals in fewer groups.",
    severities: ["error"],
    origin: "resolve",
  },
};
