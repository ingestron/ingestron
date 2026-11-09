// Aliased settings checked against intent written as intent and against the standard's
// fixed values (specification section 11.4).
import type { Context } from "../context/index.js";
import { holdsUnsetEnvvar } from "../diagnostics/index.js";
import { sameValue } from "../internal/index.js";
import type { AliasStage } from "./aliases.js";
import { changedFixed, reportFixed } from "./fixed-values.js";
import type { IntentStage } from "./intent-stages.js";
import { describeIntent, leaves, valueAtIntentPath } from "./intent-values.js";
import { settingMovedFix, settingMovedHint } from "./setting-moved.js";

type Written = Record<string, unknown>;

/** The declared stage at the same place as an aliased setting; the platform and rules have none. */
const samePlace: Partial<Record<AliasStage["origin"], IntentStage["origin"]>> = {
  standard: "standard",
  definition: "definition",
  table: "table",
  fixed: "fixed",
};

/**
 * The aliased settings that count as intent. A setting that disagrees with intent written
 * at its place is `INTENT_CONFLICT`, and one in a definition that changes the standard's
 * fixed intent is `FIXED_SETTING`: neither counts. Every other setting outside `fixed` is
 * `SETTING_MOVED`. Intent a definition writes that changes a fixed aliased setting is
 * `FIXED_SETTING` too.
 */
export function checkedAliases(
  context: Context,
  declared: IntentStage[],
  aliases: AliasStage[],
): AliasStage[] {
  checkFixedAliases(context, declared, aliases);
  return aliases.filter((alias) => {
    if (conflicting(context, declared, alias)) return false;
    if (alias.origin === "fixed") return true;
    if (changesFixed(context, declared, alias)) return false;
    const fix = settingMovedFix(context, alias);
    context.reporter.warning(
      "SETTING_MOVED",
      `"${alias.setting}" is now written as intent: ${describeIntent(alias.intent)}.`,
      alias.at,
      fix ? undefined : settingMovedHint,
      fix ? [fix] : [],
    );
    return true;
  });
}

/** A value that holds an unset reference changes nothing, except when resolving for deploy. */
function unknownIn(context: Context): (value: unknown) => boolean {
  return (value) => !context.deployTime && holdsUnsetEnvvar(context.project, value);
}

/** `FIXED_SETTING` at intent a definition writes that differs from a fixed aliased setting. */
function checkFixedAliases(context: Context, declared: IntentStage[], aliases: AliasStage[]): void {
  const written = declared.filter(({ origin }) => origin === "definition" || origin === "table");
  for (const fixed of aliases.filter(({ origin }) => origin === "fixed"))
    for (const stage of written)
      for (const change of changedFixed(
        fixed.intent as Written,
        stage.intent as Written,
        [],
        unknownIn(context),
      ))
        reportFixed(context, change, stage.at(change.path.join(".")));
}

/** `INTENT_CONFLICT` when the setting's intent differs from intent written at the same place. */
function conflicting(context: Context, declared: IntentStage[], alias: AliasStage): boolean {
  const place = declared.find(({ origin }) => origin === samePlace[alias.origin]);
  if (!place) return false;
  const differing = leaves(alias.intent).filter((path) => {
    const written = valueAtIntentPath(place.intent, path);
    return written !== undefined && !sameValue(written, valueAtIntentPath(alias.intent, path));
  });
  if (differing.length === 0) return false;
  const shown = typeof alias.value === "string" ? alias.value : JSON.stringify(alias.value);
  const remove = {
    title: "Remove this setting",
    edits: [{ file: alias.at.document.file, pointer: alias.at.pointer, remove: true as const }],
  };
  context.reporter.error(
    "INTENT_CONFLICT",
    `"${alias.setting}: ${shown}" means ${describeIntent(alias.intent)}, but this ${placeName(alias)} also says ${describeIntent(place.intent, differing)}.`,
    alias.at,
    undefined,
    [remove],
  );
  return true;
}

/** The place an aliased setting is written, as a message names it. */
function placeName(alias: AliasStage): string {
  if (alias.origin === "table") return "table";
  if (alias.origin === "definition") return alias.at.document.kind.toLowerCase();
  return "standard";
}

/** `FIXED_SETTING` at a definition's aliased setting whose intent differs from the standard's fixed intent. */
function changesFixed(context: Context, declared: IntentStage[], alias: AliasStage): boolean {
  if (alias.origin !== "definition" && alias.origin !== "table") return false;
  const fixed = declared.find(({ origin }) => origin === "fixed");
  if (!fixed) return false;
  const changes = changedFixed(
    fixed.intent as Written,
    alias.intent as Written,
    [],
    unknownIn(context),
  );
  for (const change of changes) reportFixed(context, change, alias.at);
  return changes.length > 0;
}
