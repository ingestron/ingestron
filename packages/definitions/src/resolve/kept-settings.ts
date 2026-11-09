// Aliased settings that intent never changes (specification section 11.4): one a pack's
// own rule wrote, and one written with a value its alias does not list. Intent that such a
// setting does not follow is `NOT_APPLIED` where the intent was written.
import type { Context } from "../context/index.js";
import { holdsUnsetEnvvar } from "../diagnostics/index.js";
import { sameValue } from "../internal/index.js";
import type { SettingAlias } from "../intent/index.js";
import type { Origin } from "../pack/index.js";
import { intentOf } from "./aliases.js";
import { positionOf, type MergedIntent } from "./intent-stages.js";
import { leaves, valueAtIntentPath } from "./intent-values.js";
import type { SettingsLayer } from "./settings.js";
import type { StepResult } from "./steps.js";

/** The value an aliased setting takes from intent, the intent path it is attributed to, and its origin. */
export interface Match {
  value: unknown;
  path: string;
  origin: Origin;
}

/** One aliased setting of a step, and the value intent would write it with, if any. */
export interface AliasedSetting {
  step: StepResult;
  setting: string;
  alias: SettingAlias;
  match: Match | undefined;
  completed: MergedIntent;
}

/**
 * The intent paths reported as not applied when the setting is kept whatever intent says:
 * its last writer is a pack's rule, or wrote a value the alias does not list. Undefined
 * when intent may write the setting as usual.
 */
export function keptSetting(context: Context, aliased: AliasedSetting): string[] | undefined {
  const { step, setting, alias } = aliased;
  const writer = step.layers.findLast(
    (layer) => layer.origin !== "pack" && Object.hasOwn(layer.value, setting),
  );
  if (!writer) return undefined;
  const value = writer.value[setting];
  if (holdsUnsetEnvvar(context.project, value)) return undefined;
  if (writer.packRule !== undefined) return byPackRule(context, aliased, writer, value);
  if ("values" in alias && !listed(alias, value)) return byValue(context, aliased, writer, value);
  return undefined;
}

function listed(alias: { values: Record<string, unknown> }, value: unknown): boolean {
  return typeof value === "string" && Object.hasOwn(alias.values, value);
}

/** Each declared path that differs from what the pack's rule's value stands for. */
function byPackRule(
  context: Context,
  { step, setting, alias, match, completed }: AliasedSetting,
  writer: SettingsLayer,
  value: unknown,
): string[] {
  const meant = intentOf(alias, value);
  const declared = (path: string) => {
    const origin = completed.origins[path];
    return origin !== undefined && origin.layer !== "pack";
  };
  const paths = meant
    ? leaves(meant).filter(
        (path) =>
          declared(path) &&
          !sameValue(valueAtIntentPath(completed.intent, path), valueAtIntentPath(meant, path)),
      )
    : match && !sameValue(match.value, value)
      ? [match.path]
      : [];
  const reason = `the pack's rule for ${writer.packRule} writes "${setting}: ${shown(value)}".`;
  for (const path of paths) report(context, step.pack, path, completed, reason);
  return paths;
}

/** The path intent would write another value from, at the writer's place or later. */
function byValue(
  context: Context,
  { step, setting, match, completed }: AliasedSetting,
  writer: SettingsLayer,
  value: unknown,
): string[] {
  if (!match || sameValue(match.value, value)) return [];
  if (positionOf(writer.origin) > positionOf(match.origin.layer)) return [];
  const file = writer.at?.document.file ?? "";
  const reason = `the setting "${setting}: ${shown(value)}" in ${file} decides it.`;
  report(context, step.pack, match.path, completed, reason);
  return [match.path];
}

function report(
  context: Context,
  pack: string,
  path: string,
  completed: MergedIntent,
  reason: string,
): void {
  const value = shown(valueAtIntentPath(completed.intent, path));
  context.reporter.warning(
    "NOT_APPLIED",
    `${path}: ${value} isn't applied on ${pack}: ${reason}`,
    completed.sources[path],
  );
}

function shown(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}
