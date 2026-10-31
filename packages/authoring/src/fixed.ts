// Values the standard fixes: where a definition writes a method setting the
// standard's `fixed` sets, completion offers that value first and marks the
// others, so nobody picks a value that is then refused.
import type { Suggestion } from "./completion.js";
import type { Place } from "./context.js";
import { settingsAt } from "./fields.js";
import { loadedDocuments, type Project } from "./project.js";

/** `items` with the fixed value first and the others marked, or unchanged when nothing is fixed here. */
export function markFixed(
  project: Project,
  place: Place,
  environment: string | undefined,
  items: Suggestion[],
): Suggestion[] {
  const fixed = fixedValue(project, place, environment);
  if (fixed === undefined) return items;
  const text = String(fixed);
  const marked = items.map((item) =>
    item.label === text
      ? { ...item, detail: "fixed by the standard", preselect: true }
      : { ...item, detail: `not allowed: the standard fixes this to ${text}` },
  );
  return [
    ...marked.filter((item) => item.label === text),
    ...marked.filter((item) => item.label !== text),
  ];
}

/** The value the standard's `fixed` gives the setting at `place` in a definition's `with`. */
function fixedValue(project: Project, place: Place, environment: string | undefined): unknown {
  if (place.kind === "Standard" || place.kind === "Platform") return undefined;
  const settings = settingsAt(project, place, place.path, environment);
  const action = place.path[place.path.indexOf("with") - 1];
  if (!settings || !action) return undefined;
  const value = keyPath(
    standardFixed(project, environment, action)?.[settings.method],
    settings.rest,
  );
  return typeof value === "object" ? undefined : value;
}

/** The standard's `<action>.fixed`, as resolved for the environment, so `${values.…}` is the value that applies. */
function standardFixed(
  project: Project,
  environment: string | undefined,
  action: string,
): Record<string, unknown> | undefined {
  const standard = loadedDocuments(project, environment)?.find(
    (document) => document.kind === "Standard",
  )?.value as Record<string, { fixed?: Record<string, unknown> } | undefined> | undefined;
  return standard?.[action]?.fixed;
}

/** The value at `keys` inside `value`, or undefined when a step is missing. */
function keyPath(value: unknown, keys: string[]): unknown {
  let found = value;
  for (const key of keys) {
    if (typeof found !== "object" || found === null) return undefined;
    found = (found as Record<string, unknown>)[key];
  }
  return found;
}
