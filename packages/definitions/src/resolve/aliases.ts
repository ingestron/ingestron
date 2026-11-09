// Method settings that are other names for intent (specification section 11.4): the
// intent each written setting stands for, and the setting written back from intent.
import type { Context } from "../context/index.js";
import type { Source } from "../diagnostics/index.js";
import { sameValue } from "../internal/index.js";
import type { Intent, SettingAlias } from "../intent/index.js";
import type { Method } from "../pack/index.js";
import { placed } from "./fixed-values.js";
import type { IntentStage, MergedIntent } from "./intent-stages.js";
import { decided, intentAt, leaves, valueAtIntentPath } from "./intent-values.js";
import { knownSettings, meetsSchema, type SettingsLayer } from "./settings.js";
import type { StepResult } from "./steps.js";

/** An aliased setting as one settings layer writes it, and the intent it stands for there. */
export interface AliasStage {
  /** The layer that wrote the setting; `platform` takes the standard's position. */
  origin: Exclude<IntentStage["origin"], "layer">;
  setting: string;
  value: unknown;
  intent: Intent;
  /** Where the setting is written. */
  at: Source;
}

/**
 * Every aliased setting the layers write, with the intent it stands for. The method's own
 * defaults are not intent, and a value that stands for nothing, such as one the alias does
 * not list or one that holds an unset reference, gives none.
 */
export function aliasStages(
  context: Context,
  method: Method,
  layers: SettingsLayer[],
): AliasStage[] {
  const aliases = Object.entries(method.aliases ?? {});
  return layers.flatMap(({ value: written, at, origin }) => {
    if (!at || origin === "pack" || origin === "layer") return [];
    return aliases.flatMap(([setting, alias]) => {
      const value = written[setting];
      const intent = decided(context, intentOf(alias, value) ?? {});
      if (leaves(intent).length === 0) return [];
      return [{ origin, setting, value, intent, at: placed(at, [setting]) }];
    });
  });
}

/** The intent a setting's value stands for; undefined when it stands for none. */
function intentOf(alias: SettingAlias, value: unknown): Intent | undefined {
  if (value === undefined) return undefined;
  if ("path" in alias) return intentAt(alias.path, value);
  return typeof value === "string" && Object.hasOwn(alias.values, value)
    ? alias.values[value]
    : undefined;
}

/** The intent paths an alias stands for. */
function aliasPaths(alias: SettingAlias): string[] {
  if ("path" in alias) return [alias.path];
  return [...new Set(Object.values(alias.values).flatMap((fragment) => leaves(fragment)))];
}

/** The setting's value for the intent: the value at its path, or the first value whose intent it holds. */
function aliasValue(alias: SettingAlias, intent: Intent): unknown {
  if ("path" in alias) return valueAtIntentPath(intent, alias.path);
  const holds = (fragment: Intent) => {
    const paths = leaves(fragment);
    return (
      paths.length > 0 &&
      paths.every((path) =>
        sameValue(valueAtIntentPath(fragment, path), valueAtIntentPath(intent, path)),
      )
    );
  };
  return Object.entries(alias.values).find(([, fragment]) => holds(fragment))?.[0];
}

/**
 * Writes each aliased setting of the step from the completed intent, changing the step's
 * settings and origins in place, when the intent at its path was declared rather than
 * filled by a pack's default, so no setting is added from defaults alone. A value the
 * method's schema refuses is `BAD_SETTING` where the intent was written.
 */
export function rewriteAliases(
  context: Context,
  step: StepResult,
  method: Method,
  completed: MergedIntent,
): void {
  for (const [setting, alias] of Object.entries(method.aliases ?? {})) {
    const path = aliasPaths(alias).find((candidate) => completed.origins[candidate]);
    const origin = path === undefined ? undefined : completed.origins[path];
    const value = aliasValue(alias, completed.intent);
    if (!path || !origin || origin.layer === "pack" || value === undefined) continue;
    if (!meetsSchema(method, { ...step.settings, [setting]: value })) {
      reportRefused(context, step.method, method, { setting, value }, completed.sources[path]);
      continue;
    }
    step.settings[setting] = value;
    step.origins[setting] = origin;
  }
}

function reportRefused(
  context: Context,
  id: string,
  method: Method,
  { setting, value }: { setting: string; value: unknown },
  at: Source | undefined,
): void {
  context.reporter.error(
    "BAD_SETTING",
    `Settings for "${id}": the intent written here makes "${setting}" ${JSON.stringify(value)}, which the method does not accept.`,
    at,
    knownSettings(method),
  );
}
