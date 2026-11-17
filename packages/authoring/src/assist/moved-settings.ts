// Method settings that are now intent (definitions specification, section 11.4). They still
// work, with SETTING_MOVED, but completion no longer offers them, except under the standard's
// `fixed.<method>`, where they are read as fixed intent; hover says which intent replaces one.
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

/** The method settings at `path` and the method's aliases, unless they are under `fixed`. */
function movedAt(
  project: Project,
  place: Place,
  path: string[],
  environment: string | undefined,
): { rest: string[]; aliases: Record<string, SettingAlias> } | undefined {
  const settings = settingsAt(project, place, path, environment);
  if (!settings || (place.kind === "Standard" && path[1] === "fixed")) return undefined;
  const aliases = packs.map((pack) => pack.methods[settings.method]).find(Boolean)?.aliases;
  return aliases && { rest: settings.rest, aliases };
}

/**
 * `items`, the keys to complete at `path`, without the method's settings that are now intent:
 * writing one is SETTING_MOVED, so completion leads to the intent instead. Under the standard's
 * `fixed.<method>` they are fixed intent, and stay.
 */
export function withoutMovedSettings(
  project: Project,
  place: Place,
  path: string[],
  environment: string | undefined,
  items: Suggestion[],
): Suggestion[] {
  const moved = movedAt(project, place, path, environment);
  if (!moved || moved.rest.length > 0) return items;
  return items.filter((item) => !Object.hasOwn(moved.aliases, item.label));
}

/** For a setting that is now intent, at the key path `segments`, what to write instead. */
export function movedSettingText(
  project: Project,
  place: Place,
  segments: string[],
  environment: string | undefined,
): string | undefined {
  const moved = movedAt(project, place, segments, environment);
  const setting = moved?.rest.length === 1 ? moved.rest[0]! : undefined;
  const alias = setting === undefined ? undefined : moved?.aliases[setting];
  if (!setting || !alias) return undefined;
  return (
    `**Now intent:** \`${setting}\` is written as \`${intentOf(alias)}\` under \`intent\`. ` +
    "Write it where it should apply, such as the flow whose tables need it, and remove this setting."
  );
}
