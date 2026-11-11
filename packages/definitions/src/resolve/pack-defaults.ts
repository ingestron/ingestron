// The chosen methods' intent defaults (specification section 11.3, ruling on which
// step's default a path takes when several give one).
import { merge } from "../internal/index.js";
import type { Intent } from "../intent/index.js";
import type { Method } from "../pack/index.js";
import type { PackRuleAlias } from "./aliases.js";
import type { MergedIntent } from "./intent-stages.js";
import { intentAt, leaves, valueAtIntentPath } from "./intent-values.js";
import { judgeOf } from "./judging-step.js";
import type { StepResult } from "./steps.js";

/** A table's step and the method chosen for it. */
export interface ChosenStep {
  step: StepResult;
  method: Method;
}

/**
 * Fills every intent path still unset from the chosen methods' `intentDefaults`, with the
 * origin `pack`. When several steps give one, the step that judges the path gives it, else
 * the later step.
 */
export function fillDefaults(completed: MergedIntent, chosen: ChosenStep[]): void {
  const paths = new Set(chosen.flatMap(({ method }) => leaves(method.intentDefaults ?? {})));
  for (const path of paths) {
    if (valueAtIntentPath(completed.intent, path) !== undefined) continue;
    const giving = chosen.filter(({ method }) => defaultAt(method, path) !== undefined);
    const from = judgeOf(path, giving) ?? giving.at(-1);
    if (!from) continue;
    completed.intent = merge(
      completed.intent as Record<string, unknown>,
      intentAt(path, defaultAt(from.method, path)) as Record<string, unknown>,
    ) as Intent;
    completed.origins[path] = { layer: "pack" };
  }
}

/**
 * Fills every intent path still unset from the aliased settings of the packs' own rules,
 * with the origin `pack` naming the setting: before the methods' defaults, so they win.
 */
export function fillPackRules(completed: MergedIntent, rules: PackRuleAlias[]): void {
  for (const { setting, intent } of rules)
    for (const path of leaves(intent)) {
      if (valueAtIntentPath(completed.intent, path) !== undefined) continue;
      completed.intent = merge(
        completed.intent as Record<string, unknown>,
        intentAt(path, valueAtIntentPath(intent, path)) as Record<string, unknown>,
      ) as Intent;
      completed.origins[path] = { layer: "pack", alias: setting };
    }
}

function defaultAt(method: Method, path: string): unknown {
  return valueAtIntentPath(method.intentDefaults ?? {}, path);
}
