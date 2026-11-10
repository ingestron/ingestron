// Help for the codes about the standard's layers (specification sections 5 and 11.1),
// shown on the documentation site with the others.
import type { DefinitionCode } from "./diagnostics.js";

/** What each code means and how to fix it. */
export const layerCodeHelp: Record<
  Extract<DefinitionCode, "UNKNOWN_LAYER" | "DUPLICATE_LAYER" | "LAYER_RESPONSIBILITY">,
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
  LAYER_RESPONSIBILITY: {
    meaning:
      "A table asks for something its layer does not do, such as a drop or fail action in a layer whose does leaves out check.",
    fix: "Put the table in a layer that does it, add the duty to the layer's does, or remove the setting.",
  },
};
