// The serve step: after a table's last step, and only when something chooses
// one (specification section 4).
import { allowsWritten, choiceOf, NO_STORE, peekMethod, type Facts, type Named } from "./choose.js";
import type { Context } from "./context.js";
import type { SettingsLayer } from "./settings.js";
import { resolveStep, type StepResult } from "./steps.js";

/**
 * The serve step after `last`: undefined when nothing chooses one (or the
 * definition writes `none`), false when one is chosen but cannot be used (reported).
 */
export function serveStep(
  context: Context,
  named: Named,
  facts: Facts,
  last: StepResult,
  layers: SettingsLayer[] = [],
): StepResult | false | undefined {
  const serveFacts = { ...facts, input: last.produces };
  const choice = choiceOf(context, "serve", named, serveFacts);
  if (!choice) {
    unusedServeSettings(context, named, layers);
    return undefined;
  }
  // A flow or transform opts out of the standard's serve choice with none.
  if (choice.written && choice.id === NO_STORE)
    return allowsWritten(context, "serve", named, NO_STORE) ? undefined : false;
  if (droppedByRunsOn(context, named, serveFacts)) return undefined;
  return resolveStep(context, "serve", named, serveFacts, layers, last) ?? false;
}

/** Where the environment runs on a pack, another pack's serve step is dropped. */
function droppedByRunsOn(context: Context, named: Named, facts: Facts): boolean {
  if (!context.runsOn) return false;
  const pick = peekMethod(context, "serve", named, facts);
  return pick?.method.action === "serve" && context.owner.get(pick.id) !== context.runsOn.id;
}

/** Serve settings with no serve step to use them (`SETTINGS_UNUSED`). */
function unusedServeSettings(context: Context, named: Named, layers: SettingsLayer[]): void {
  const written = [
    ...(named.doc?.with ? [{ document: named.owner, pointer: "/serve/with" }] : []),
    ...layers.flatMap((layer) => (layer.at ? [layer.at] : [])),
  ];
  for (const at of written)
    context.reporter.warning(
      "SETTINGS_UNUSED",
      "Nothing chooses a serve method, so these settings are not used.",
      at,
    );
}
