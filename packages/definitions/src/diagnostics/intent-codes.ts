// Help for the codes about method settings that are other names for intent
// (specification section 11.4), shown on the documentation site with the others.
import type { DefinitionCode } from "./diagnostics.js";

/** What each code means and how to fix it. */
export const intentCodeHelp: Record<
  Extract<DefinitionCode, "SETTING_MOVED" | "INTENT_CONFLICT">,
  { meaning: string; fix: string }
> = {
  SETTING_MOVED: {
    meaning: "A method setting is now written as intent, which every pack reads.",
    fix: "Apply the fix: it writes the intent and removes the setting.",
  },
  INTENT_CONFLICT: {
    meaning: "A method setting and the intent written in the same place disagree.",
    fix: "Remove the setting, or make it agree with the intent.",
  },
};
