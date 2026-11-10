// Help for the codes of choosing each step's method (specification sections 4 and
// 7.3), shown on the documentation site with the others.
import type { CodeHelp } from "./code-help.js";
import type { DefinitionCode } from "./diagnostics.js";

type MethodCode =
  | "UNKNOWN_METHOD"
  | "WRONG_ACTION"
  | "METHOD_NOT_ALLOWED"
  | "CONNECTOR_NOT_SUPPORTED"
  | "CONNECTIVITY_NOT_SUPPORTED"
  | "RUNS_ON"
  | "RUNS_ON_SKIPPED";

/** What each code means and how to fix it. */
export const methodCodeHelp: Record<Extract<DefinitionCode, MethodCode>, CodeHelp> = {
  UNKNOWN_METHOD: {
    meaning: "No pack has a method with this name.",
    fix: "Check the spelling, or choose a method listed in the reference.",
    severities: ["error"],
    origin: "resolve",
  },
  WRONG_ACTION: {
    meaning: "The method is for another action, such as a store method in ingest.",
    fix: "Choose a method for this action.",
    severities: ["error"],
    origin: "resolve",
  },
  METHOD_NOT_ALLOWED: {
    meaning: "The standard's allowed list does not include this method.",
    fix: "Choose an allowed method, or ask the standard's owners to allow it.",
    severities: ["error"],
    origin: "resolve",
  },
  CONNECTOR_NOT_SUPPORTED: {
    meaning: "The ingest method cannot read this connection's connector.",
    fix: "Use a method that reads it: the problem's fixes list them, including any from a pack the standard does not name yet.",
    severities: ["error"],
    origin: "resolve",
  },
  CONNECTIVITY_NOT_SUPPORTED: {
    meaning: "The ingest method cannot reach a source with this connectivity.",
    fix: "Use a method that reaches it, such as a copy from a private network: the problem's fixes list them, including any from a pack the standard does not name yet.",
    severities: ["error"],
    origin: "resolve",
  },
  RUNS_ON: {
    meaning:
      "In an environment that runs on a pack, a table's store or transform belongs to another pack, or the pack has no method that reads landed files; or a method that reads landed files was chosen outside runs-on.",
    fix: "Keep the table's store and transforms with the pack the environment runs on, or remove runs-on from the environment.",
    severities: ["error"],
    origin: "resolve",
  },
  RUNS_ON_SKIPPED: {
    meaning:
      "In an environment that runs on a pack, a table whose ingest lands no files is left out, with the transforms that read it.",
    fix: "Nothing, if the table is not needed there; otherwise land its files with a method that does.",
    severities: ["warning"],
    origin: "resolve",
  },
};
