// Method names to complete after `uses`, from the standard's packs.
import { NO_STORE } from "@ingestron/definitions";
import type { Project } from "./project.js";
import { standardPacks } from "./smart.js";
import type { Suggestion } from "./suggestion.js";

/**
 * The standard's packs' methods for an action, with `none` where it may be
 * written: a flow's or a standard's store, and a flow's or transform's serve.
 */
export function methodsFor(project: Project, action: string, withNone: boolean): Suggestion[] {
  const none = withNone ? [action === "serve" ? noServe : noStore] : [];
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

const noServe: Suggestion = {
  label: NO_STORE,
  kind: "method",
  documentation: "No serve step for these tables, whatever the standard chooses.",
};

const noStore: Suggestion = {
  label: NO_STORE,
  kind: "method",
  documentation: "End the flow at the files ingest lands: no store step.",
};

const actions = ["ingest", "transform", "store", "serve"];

/**
 * Methods to complete where a method is named: a flow's or transform's
 * `<action>.uses`, or a standard's `<action>.default`, `allowed` item or rule
 * `use`; undefined elsewhere.
 */
export function methodChoices(
  project: Project,
  kind: string | undefined,
  path: string[],
): Suggestion[] | undefined {
  if (path.at(-1) === "uses" && path.length >= 2) {
    const action = path.at(-2)!;
    const none = (kind === "Flow" && action === "store") || action === "serve";
    return methodsFor(project, action, none);
  }
  const action = path[0] ?? "";
  if (kind !== "Standard" || !actions.includes(action)) return undefined;
  const where = path
    .slice(1)
    .map((part) => (/^\d+$/.test(part) ? "#" : part))
    .join("/");
  if (!["default", "allowed/#", "when/#/use"].includes(where)) return undefined;
  return methodsFor(project, action, action === "store");
}
