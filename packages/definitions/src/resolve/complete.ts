// A table's intent once its methods are chosen (specification sections 11.2 to 11.4):
// declared intent, the chosen methods' aliased settings at their places, then the
// methods' intent defaults for what is still unset.
import type { Context } from "../context/index.js";
import type { Source } from "../diagnostics/index.js";
import type { Action, ResolvedTable } from "../pack/index.js";
import { checkedAliases } from "./alias-checks.js";
import { aliasStages, type AliasStage } from "./aliases.js";
import { rewriteAliases } from "./rewrite-aliases.js";
import type { DeclaredIntent } from "./declared-intent.js";
import { mergeStages, positionOf, type IntentStage, type MergedIntent } from "./intent-stages.js";
import { fillDefaults } from "./pack-defaults.js";
import type { StepResult } from "./steps.js";

/**
 * The table's completed intent, the origin of each value and where it was written.
 * Aliased settings count as intent at their places, each before intent written as intent
 * at the same place; the
 * chosen methods' `intentDefaults` then fill unset paths (origin `pack`).
 * Last, each step's aliased settings are written from the result.
 */
export function completeIntent(
  context: Context,
  declared: DeclaredIntent,
  steps: StepResult[],
): MergedIntent {
  const chosen = steps.flatMap((step) => {
    const method = context.pack.methods[step.method];
    return method ? [{ step, method }] : [];
  });
  const aliases = chosen.flatMap(({ step, method }) => aliasStages(context, method, step.layers));
  const counted = checkedAliases(context, declared.stages, aliases).map(aliasStage);
  const stages = [...counted, ...declared.stages].sort(
    (a, b) => positionOf(a.origin) - positionOf(b.origin),
  );
  const completed = mergeStages(stages);
  fillDefaults(completed, chosen);
  for (const { step, method } of chosen) rewriteAliases(context, step, method, completed);
  return completed;
}

/**
 * The table's `intent` and `intentOrigins`, completed from the steps it resolved, if any,
 * and where each value was written, for judging it (section 11.5).
 */
export function tableIntent(
  context: Context,
  declared: DeclaredIntent,
  steps: Partial<Record<Action, StepResult>> | undefined,
): Pick<ResolvedTable, "intent" | "intentOrigins"> & { intentSources: Record<string, Source> } {
  const { ingest, transform, store, serve } = steps ?? {};
  const resolved = [ingest, transform, store, serve].filter((step) => step !== undefined);
  const { intent, origins, sources } = completeIntent(context, declared, resolved);
  return { intent, intentOrigins: origins, intentSources: sources };
}

/** An aliased setting as a stage: every path it stands for was written at the setting. */
function aliasStage(alias: AliasStage): IntentStage {
  return { origin: alias.origin, intent: alias.intent, at: () => alias.at };
}
