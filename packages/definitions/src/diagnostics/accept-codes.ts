// Help for the codes about the Platform's list of accepted warnings (specification, Accepted
// warnings), shown on the documentation site with the others.
import type { CodeHelp } from "./code-help.js";
import type { DefinitionCode } from "./diagnostics.js";

/** What each code means and how to fix it. */
export const acceptCodeHelp: Record<
  Extract<DefinitionCode, "ACCEPT_CODE" | "ACCEPT_UNUSED">,
  CodeHelp
> = {
  ACCEPT_CODE: {
    meaning:
      "An entry in the Platform's accept list names a code that is not a problem code, is only ever an error, is no longer reported, or is ACCEPT_CODE or ACCEPT_UNUSED. Only warnings can be accepted.",
    fix: "Use the code of a warning, as ingestron check prints it, or remove the entry.",
    severities: ["error"],
    origin: "resolve",
  },
  ACCEPT_UNUSED: {
    meaning:
      "An entry in the Platform's accept list matches no warning in this run, so it is out of date or written for another environment. A warning.",
    fix: "Remove the entry, or correct its code or about. To accept different warnings in each environment, write the list as accept: ${values.accept}.",
    severities: ["warning"],
    origin: "resolve",
  },
};
