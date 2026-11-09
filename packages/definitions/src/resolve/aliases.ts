// Method settings that are other names for intent (specification section 11.4): the
// intent each written setting stands for.
import type { Context } from "../context/index.js";
import type { Source } from "../diagnostics/index.js";
import type { Intent, SettingAlias } from "../intent/index.js";
import type { Method } from "../pack/index.js";
import { placed } from "./fixed-values.js";
import type { IntentStage } from "./intent-stages.js";
import { decided, intentAt, leaves } from "./intent-values.js";
import type { SettingsLayer } from "./settings.js";

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

/** A pack's own rule's aliased setting, the intent it stands for, and the rule's facts. */
export interface PackRuleAlias {
  setting: string;
  value: unknown;
  intent: Intent;
  facts: string;
}

/**
 * The aliased settings a pack's own rule writes, with the intent each stands for: not
 * declared intent, but read with the origin `pack` before the methods' defaults.
 */
export function packRuleAliases(
  context: Context,
  method: Method,
  layers: SettingsLayer[],
): PackRuleAlias[] {
  const aliases = Object.entries(method.aliases ?? {});
  return layers.flatMap(({ value: written, packRule }) => {
    if (packRule === undefined) return [];
    return aliases.flatMap(([setting, alias]) => {
      const value = written[setting];
      const intent = decided(context, intentOf(alias, value) ?? {});
      return leaves(intent).length === 0 ? [] : [{ setting, value, intent, facts: packRule }];
    });
  });
}

/** The intent a setting's value stands for; undefined when it stands for none. */
export function intentOf(alias: SettingAlias, value: unknown): Intent | undefined {
  if (value === undefined) return undefined;
  if ("path" in alias) return intentAt(alias.path, value);
  return typeof value === "string" && Object.hasOwn(alias.values, value)
    ? alias.values[value]
    : undefined;
}
