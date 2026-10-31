// The serve step: after a table's last step, and only when something chooses
// one (specification section 4).
import { hasChoice, peekMethod, type Facts, type Named } from "./choose.js";
import type { Context } from "./context.js";
import type { SettingsLayer } from "./settings.js";
import { resolveStep, type StepResult } from "./steps.js";

/**
 * The serve step after `last`: undefined when nothing chooses one, false when
 * one is chosen but cannot be used (reported).
 */
export function serveStep(
  context: Context,
  named: Named,
  facts: Facts,
  last: StepResult,
  layers: SettingsLayer[] = [],
): StepResult | false | undefined {
  const serveFacts = { ...facts, input: last.produces };
  const pick = peekMethod(context, "serve", named, serveFacts);
  if (!pick && !hasChoice(context, "serve", named, serveFacts)) return undefined;
  // Where the environment runs on a pack, another pack's serve step is dropped.
  const foreign =
    pick?.method.action === "serve" && context.owner.get(pick.id) !== context.runsOn?.id;
  if (context.runsOn && foreign) return undefined;
  return resolveStep(context, "serve", named, serveFacts, layers, last) ?? false;
}
