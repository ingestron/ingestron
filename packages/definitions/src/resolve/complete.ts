// A table's intent once its methods are chosen (specification sections 11.2 to 11.4):
// declared intent, the chosen methods' aliased settings at their places, then the
// methods' intent defaults for what is still unset.
import type { Context } from "../context/index.js";
import { merge } from "../internal/index.js";
import type { Intent } from "../intent/index.js";
import type { Action, Method, Origin, ResolvedTable } from "../pack/index.js";
import { checkedAliases } from "./alias-checks.js";
import { aliasStages, rewriteAliases, type AliasStage } from "./aliases.js";
import type { DeclaredIntent } from "./declared-intent.js";
import { mergeStages, type IntentStage, type MergedIntent } from "./intent-stages.js";
import { intentAt, leaves, valueAtIntentPath } from "./intent-values.js";
import type { StepResult } from "./steps.js";

/** The positions of the precedence (section 11.2); the platform's settings take the standard's. */
const positions: IntentStage["origin"][] = [
  "standard",
  "layer",
  "rule",
  "definition",
  "table",
  "fixed",
];

/**
 * The table's completed intent and the origin of each value. Aliased settings count as
 * intent at their places, each before intent written as intent at the same place; each
 * chosen method's `intentDefaults`, in step order, then fill unset paths (origin `pack`).
 * Last, each step's aliased settings are written from the result.
 */
export function completeIntent(
  context: Context,
  declared: DeclaredIntent,
  steps: StepResult[],
): { intent: Intent; origins: Record<string, Origin> } {
  const chosen = steps.flatMap((step) => {
    const method = context.pack.methods[step.method];
    return method ? [{ step, method }] : [];
  });
  const aliases = chosen.flatMap(({ step, method }) => aliasStages(context, method, step.layers));
  const counted = checkedAliases(context, declared.stages, aliases).map(aliasStage);
  const stages = [...counted, ...declared.stages].sort(
    (a, b) => position(a.origin) - position(b.origin),
  );
  const completed = mergeStages(stages);
  for (const { method } of chosen) fillDefaults(completed, method);
  for (const { step, method } of chosen) rewriteAliases(context, step, method, completed);
  return { intent: completed.intent, origins: completed.origins };
}

/** The table's `intent` and `intentOrigins`, completed from the steps it resolved, if any. */
export function tableIntent(
  context: Context,
  declared: DeclaredIntent,
  steps: Partial<Record<Action, StepResult>> | undefined,
): Pick<ResolvedTable, "intent" | "intentOrigins"> {
  const { ingest, transform, store, serve } = steps ?? {};
  const resolved = [ingest, transform, store, serve].filter((step) => step !== undefined);
  const { intent, origins } = completeIntent(context, declared, resolved);
  return { intent, intentOrigins: origins };
}

function position(origin: IntentStage["origin"]): number {
  return positions.indexOf(origin === "platform" ? "standard" : origin);
}

/** An aliased setting as a stage: every path it stands for was written at the setting. */
function aliasStage(alias: AliasStage): IntentStage {
  return { origin: alias.origin, intent: alias.intent, at: () => alias.at };
}

/** The method's intent defaults at every path still unset, with the origin `pack`. */
function fillDefaults(completed: MergedIntent, method: Method): void {
  const defaults = method.intentDefaults ?? {};
  for (const path of leaves(defaults)) {
    if (valueAtIntentPath(completed.intent, path) !== undefined) continue;
    const value = valueAtIntentPath(defaults, path);
    completed.intent = merge(
      completed.intent as Record<string, unknown>,
      intentAt(path, value) as Record<string, unknown>,
    ) as Intent;
    completed.origins[path] = { layer: "pack" };
  }
}
