// Help for the codes about data products and their governance (specification sections 8 and
// 8.1), shown on the documentation site with the others.
import type { CodeHelp } from "./code-help.js";
import type { DefinitionCode } from "./diagnostics.js";

/** What each code means and how to fix it. */
export const productCodeHelp: Record<
  Extract<
    DefinitionCode,
    | "PRODUCT_CONTRACT_UNUSED"
    | "PRODUCT_NOT_BUILT"
    | "PRODUCT_CONTRACT_SHARED"
    | "DUPLICATE_PRODUCT"
    | "PRODUCT_ID"
    | "PRODUCT_INCOMPLETE"
    | "COLUMN_UNCLASSIFIED"
    | "CLASSIFICATION_UNKNOWN"
    | "SENSITIVE_ACCESS"
  >,
  CodeHelp
> = {
  PRODUCT_CONTRACT_UNUSED: {
    meaning: "A data product's output port names a contract that no flow table or transform uses.",
    fix: "Use the contract in a flow's table or a transform, or remove the output port.",
    severities: ["error"],
    origin: "resolve",
  },
  PRODUCT_NOT_BUILT: {
    meaning:
      "A data product's output is not built in this environment, for example where runs-on leaves its table out. A warning; the passport says so.",
    fix: "Nothing, if that is expected here; otherwise build the table in this environment.",
    severities: ["warning"],
    origin: "resolve",
  },
  PRODUCT_CONTRACT_SHARED: {
    meaning: "Two data products publish the same contract; each published table has one owner.",
    fix: "Publish the contract from one product, and list it as an input port of the other.",
    severities: ["error"],
    origin: "resolve",
  },
  DUPLICATE_PRODUCT: {
    meaning: "Two files define a data product with the same id.",
    fix: "Give each data product its own id, or remove one of the files.",
    severities: ["error"],
    origin: "resolve",
  },
  PRODUCT_ID: {
    meaning:
      "A data product's id would name its passport README.md, the file that lists every product.",
    fix: "Choose another id for the data product.",
    severities: ["error"],
    origin: "resolve",
  },
  PRODUCT_INCOMPLETE: {
    meaning:
      "A data product leaves out a fact the standard's governance requires, such as its owner or purpose.",
    fix: "Add it to the product: a team member with role owner, description.purpose, a support channel or a domain.",
    severities: ["error"],
    origin: "resolve",
  },
  COLUMN_UNCLASSIFIED: {
    meaning:
      "The standard requires every column a data product publishes to be classified, and this one is not.",
    fix: "Give the column a classification, one of the values the standard lists.",
    severities: ["error"],
    origin: "resolve",
  },
  CLASSIFICATION_UNKNOWN: {
    meaning: "A published column's classification is not one the standard's governance lists.",
    fix: "Use one of the standard's values; each is offered as a quick fix.",
    severities: ["error"],
    origin: "resolve",
  },
  SENSITIVE_ACCESS: {
    meaning:
      "A published contract has sensitive columns but does not say who may use it, or a role leaves out a field the standard requires.",
    fix: "Add roles to the contract, each with the access, purpose (description) and approvers the standard asks for.",
    severities: ["error"],
    origin: "resolve",
  },
};
