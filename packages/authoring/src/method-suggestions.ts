// Method names to complete after `uses`, from the standard's packs.
import { NO_STORE } from "@ingestron/definitions";
import type { Project } from "./project.js";
import { standardPacks } from "./smart.js";
import type { Suggestion } from "./suggestion.js";

/** The standard's packs' methods for an action; a flow's store may also be `none`. */
export function methodsFor(project: Project, action: string, flow: boolean): Suggestion[] {
  const none = flow && action === "store" ? [noStore] : [];
  return [
    ...standardPacks(project)
      .flatMap((pack) => Object.entries(pack.methods))
      .filter(([, method]) => method.action === action)
      .map(([label, method]) => ({
        label,
        kind: "method" as const,
        documentation: method.description,
      })),
    ...none,
  ].sort((a, b) => a.label.localeCompare(b.label));
}

const noStore: Suggestion = {
  label: NO_STORE,
  kind: "method",
  documentation: "End the flow at the files ingest lands: no store step.",
};
