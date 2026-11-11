// Method settings that are now intent (definitions specification, section 11.4): completion
// still offers them, since they work, but last, naming the intent that replaces each, so the
// intent is what a reader writes first.
import { packs } from "@ingestron/core";
import type { SettingAlias } from "@ingestron/definitions";
import type { Place } from "../navigation/index.js";
import type { Project } from "../project/index.js";
import { settingsAt } from "./fields.js";
import type { Suggestion } from "./suggestion.js";

/** The intent a setting stands for, such as `history` for `mode` or `sequence` for `sequence_by`. */
function intentOf(alias: SettingAlias): string {
  if ("path" in alias) return alias.path;
  const paths = Object.values(alias.values).flatMap((fragment) => leafPaths(fragment, ""));
  return [...new Set(paths)].join(", ");
}

function leafPaths(value: unknown, prefix: string): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, item]) =>
    leafPaths(item, prefix ? `${prefix}.${key}` : key),
  );
}

/**
 * `items`, the keys to complete at `path`, with the method's settings that are now intent moved
 * to the end, each with the intent that replaces it as its detail. Other keys are unchanged.
 */
export function movedSettingsLast(
  project: Project,
  place: Place,
  path: string[],
  environment: string | undefined,
  items: Suggestion[],
): Suggestion[] {
  const settings = settingsAt(project, place, path, environment);
  if (!settings || settings.rest.length > 0) return items;
  const name = settings.method;
  const aliases = packs.map((pack) => pack.methods[name]).find(Boolean)?.aliases ?? {};
  const isMoved = (item: Suggestion) => Object.hasOwn(aliases, item.label);
  const moved = items
    .filter(isMoved)
    .map((item) => ({ ...item, detail: `now intent: ${intentOf(aliases[item.label]!)}` }));
  return [...items.filter((item) => !isMoved(item)), ...moved];
}
