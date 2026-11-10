// Help for the codes about the standard's layers (specification sections 5 and 11.1),
// shown on the documentation site with the others.
import type { Severity } from "@ingestron/config";
import type { DefinitionCode } from "./diagnostics.js";

/** What each code means and how to fix it. */
export const layerCodeHelp: Record<
  Extract<
    DefinitionCode,
    "UNKNOWN_LAYER" | "DUPLICATE_LAYER" | "LAYER_RESPONSIBILITY" | "QUARANTINE_UNUSED"
  >,
  { meaning: string; fix: string; severities: readonly Severity[] }
> = {
  UNKNOWN_LAYER: {
    meaning: "The layer is not in the standard's list of layers.",
    fix: "Use a listed layer, or add it to the standard's layers.",
    severities: ["error"],
  },
  DUPLICATE_LAYER: {
    meaning: "The standard lists a layer name more than once.",
    fix: "List each layer once.",
    severities: ["error"],
  },
  LAYER_RESPONSIBILITY: {
    meaning:
      "A table asks for something its layer does not do, such as a drop or fail action in a layer whose does leaves out check.",
    fix: "Put the table in a layer that does it, add the duty to the layer's does, or remove the setting.",
    severities: ["error"],
  },
  QUARANTINE_UNUSED: {
    meaning:
      "A table asks to keep the rows that fail a check in a table of their own, but none of its checks has the action drop, so no row is ever set aside. A warning.",
    fix: "Set a check's action to drop, or remove quarantine.",
    severities: ["warning"],
  },
};
