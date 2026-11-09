// Help for the codes about the Platform's fields and pack sections (specification section 7).
import type { DefinitionCode } from "./diagnostics.js";

/** What each code means and how to fix it. */
export const platformCodeHelp: Record<
  Extract<DefinitionCode, "PLATFORM_FIELD_MOVED">,
  { meaning: string; fix: string }
> = {
  PLATFORM_FIELD_MOVED: {
    meaning:
      "A Platform field now belongs elsewhere: a Databricks field in the databricks section, or notifications in alerts. It is still read.",
    fix: "Apply the fix: it writes the field in its new place and removes the old one.",
  },
};
