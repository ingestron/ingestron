// Help for the codes about intent: method settings that are other names for it
// (specification section 11.4) and what the packs apply of it (section 11.5), shown on
// the documentation site with the others.
import type { CodeHelp } from "./code-help.js";
import type { DefinitionCode } from "./diagnostics.js";

/** What each code means and how to fix it. */
export const intentCodeHelp: Record<
  Extract<DefinitionCode, "SETTING_MOVED" | "INTENT_CONFLICT" | "NOT_APPLIED" | "PREVIEW_FEATURE">,
  CodeHelp
> = {
  SETTING_MOVED: {
    meaning: "A method setting is now written as intent, which every pack reads.",
    fix: "Apply the fix: it writes the intent and removes the setting.",
    severities: ["warning"],
    origin: "resolve",
  },
  INTENT_CONFLICT: {
    meaning: "A method setting and the intent written in the same place disagree.",
    fix: "Remove the setting, or make it agree with the intent.",
    severities: ["error"],
    origin: "resolve",
  },
  NOT_APPLIED: {
    meaning:
      "A feature the definitions declare isn't applied on the engine that keeps the table: an intent value, a quality rule kind or action, a table check, or a contract field. The message gives the pack's reason.",
    fix: "Remove the feature, choose a method or pack that applies it, or accept that the table goes without it.",
    severities: ["warning"],
    origin: "resolve",
  },
  PREVIEW_FEATURE: {
    meaning:
      "The standard uses only generally available features, and a table uses one that is still in preview on its platform.",
    fix: "Remove the feature, or apply the fix to allow preview features in the standard.",
    severities: ["warning"],
    origin: "resolve",
  },
};
