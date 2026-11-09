// Aliased settings written from a table's completed intent (specification section 11.4).
import type { Context } from "../context/index.js";
import { holdsUnsetEnvvar, type Source } from "../diagnostics/index.js";
import { sameValue } from "../internal/index.js";
import type { Intent, SettingAlias } from "../intent/index.js";
import type { Method, Origin } from "../pack/index.js";
import { positionOf, type MergedIntent } from "./intent-stages.js";
import { leaves, valueAtIntentPath } from "./intent-values.js";
import { knownSettings, refusesSetting } from "./settings.js";
import type { StepResult } from "./steps.js";

/** The value an aliased setting takes from intent, the intent path it is attributed to, and its origin. */
interface Match {
  value: unknown;
  path: string;
  origin: Origin;
}

/**
 * Writes each aliased setting of the step from the completed intent, changing the step's
 * settings and origins in place. Only declared intent writes a setting, never a pack's
 * default alone; a setting written later in the precedence than that intent, or holding
 * an unset reference, is kept as written. A value the method's schema refuses is
 * `BAD_SETTING` where the intent was written, and the setting is kept.
 */
export function rewriteAliases(
  context: Context,
  step: StepResult,
  method: Method,
  completed: MergedIntent,
): void {
  for (const [setting, alias] of Object.entries(method.aliases ?? {})) {
    const match = matchOf(alias, completed);
    if (!match || !overwritable(context, step, setting, match.origin)) continue;
    const { value, path, origin } = match;
    if (refusesSetting(method, { ...step.settings, [setting]: value }, setting)) {
      reportRefused(context, step.method, method, { setting, value }, completed.sources[path]);
      continue;
    }
    step.settings[setting] = value;
    // The setting's own origin is a place, not a setting it was read from.
    step.origins[setting] = { layer: origin.layer, file: origin.file, line: origin.line };
  }
}

/**
 * For a `path` alias, the value at the path; for `values`, the first value whose intent
 * the completed intent holds, attributed to the latest-placed of that intent's paths.
 * None unless at least one of those paths was declared rather than a pack's default.
 */
function matchOf(alias: SettingAlias, completed: MergedIntent): Match | undefined {
  if ("path" in alias) {
    const value = valueAtIntentPath(completed.intent, alias.path);
    return value === undefined ? undefined : declaredMatch(value, [alias.path], completed);
  }
  const held = Object.entries(alias.values).find(([, fragment]) =>
    holds(completed.intent, fragment),
  );
  return held && declaredMatch(held[0], leaves(held[1]), completed);
}

function declaredMatch(
  value: unknown,
  paths: string[],
  completed: MergedIntent,
): Match | undefined {
  const declared = paths
    .map((path) => ({ path, origin: completed.origins[path] }))
    .filter((item): item is { path: string; origin: Origin } => item.origin !== undefined)
    .filter(({ origin }) => origin.layer !== "pack");
  const latest = declared.reduce<(typeof declared)[number] | undefined>(
    (best, item) =>
      best && positionOf(best.origin.layer) >= positionOf(item.origin.layer) ? best : item,
    undefined,
  );
  return latest && { value, ...latest };
}

/** True when the intent holds every value of the fragment, which says something. */
function holds(intent: Intent, fragment: Intent): boolean {
  const paths = leaves(fragment);
  return (
    paths.length > 0 &&
    paths.every((path) =>
      sameValue(valueAtIntentPath(fragment, path), valueAtIntentPath(intent, path)),
    )
  );
}

/**
 * False when the setting holds an unset reference, which stands for no intent but is kept,
 * or when the last place that wrote it comes later in the precedence than the intent.
 */
function overwritable(
  context: Context,
  step: StepResult,
  setting: string,
  origin: Origin,
): boolean {
  if (holdsUnsetEnvvar(context.project, step.settings[setting])) return false;
  const writer = step.layers.findLast(
    (layer) => layer.origin !== "pack" && Object.hasOwn(layer.value, setting),
  );
  return !writer || positionOf(writer.origin) <= positionOf(origin.layer);
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
