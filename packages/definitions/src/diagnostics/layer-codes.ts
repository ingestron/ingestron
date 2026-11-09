// Help for the codes about the standard's layers (specification sections 5 and 11.1),
// shown on the documentation site with the others.
import type { DefinitionCode } from "./diagnostics.js";

/** What each code means and how to fix it. */
export const layerCodeHelp: Record<
  Extract<DefinitionCode, "UNKNOWN_LAYER" | "DUPLICATE_LAYER">,
  { meaning: string; fix: string }
> = {
  UNKNOWN_LAYER: {
    meaning: "The layer is not in the standard's list of layers.",
    fix: "Use a listed layer, or add it to the standard's layers.",
  },
  DUPLICATE_LAYER: {
    meaning: "The standard lists a layer name more than once.",
    fix: "List each layer once.",
  },
};
