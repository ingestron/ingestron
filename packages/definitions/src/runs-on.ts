// An environment that runs on a pack (specification section 4, "Runs on"):
// another pack's files ingest becomes the pack's landed method, another
// pack's ingest that lands no files is left out, and the rest must be the
// pack's to run.
import { peekMethod, type Facts, type Named } from "./choose.js";
import type { Context } from "./context.js";
import type { Source } from "./diagnostics.js";
import type { ResolvedTable } from "./model.js";
import { resolveStep, type StepResult } from "./steps.js";

/**
 * Under runs-on, the landed method in place of another pack's files ingest.
 * Undefined when nothing is replaced; `step` is undefined when the replacement failed (reported).
 */
export function landedIngest(
  context: Context,
  named: Named,
  facts: Facts,
): { step: StepResult | undefined } | undefined {
  const runsOn = context.runsOn;
  const pick = foreignIngest(context, named, facts);
  if (!runsOn || !pick || pick.method.produces !== "files") return undefined;
  const landed = Object.keys(runsOn.methods).find((id) => {
    const method = runsOn.methods[id]!;
    return method.action === "ingest" && method.reads === "landed";
  });
  if (!landed) {
    context.reporter.error(
      "RUNS_ON",
      `"${runsOn.id}" has no method that reads landed files, so "${pick.id}" cannot run in ${context.environment}.`,
      { document: named.owner, pointer: "/source" },
    );
    return { step: undefined };
  }
  // Chosen by runs-on: the standard's allowed list does not apply, and
  // missing settings belong in the standard, not the flow.
  const replacement = {
    owner: named.owner,
    doc: { uses: landed },
    at: "/source",
    runsOn: true,
  } as const;
  const step = resolveStep(context, "ingest", replacement, facts);
  return { step: step && { ...step, chosenBy: { by: "runs-on", pack: runsOn.id } } };
}

/** Under runs-on, true when another pack's ingest lands no files: the table is left out, with a warning. */
export function leftOut(
  context: Context,
  named: Named,
  facts: Facts,
  table: string,
  at: Source,
): boolean {
  const pick = foreignIngest(context, named, facts);
  if (!pick || pick.method.produces !== "table") return false;
  context.reporter.warning(
    "RUNS_ON_SKIPPED",
    `"${table}" is ingested by "${pick.id}", which lands no files, so it is left out of ${context.environment}.`,
    at,
  );
  context.skipped.add(table);
  return true;
}

/**
 * Under runs-on, the ingest method chosen as usual when it belongs to another
 * pack; undefined otherwise, or when it is not an ingest method (reported as
 * anywhere else).
 */
function foreignIngest(context: Context, named: Named, facts: Facts) {
  const runsOn = context.runsOn;
  const pick = runsOn && peekMethod(context, "ingest", named, facts);
  if (!pick || pick.method.action !== "ingest") return undefined;
  return context.owner.get(pick.id) === runsOn!.id ? undefined : pick;
}

/** Under runs-on, each table's store and transform must be the pack's (`RUNS_ON`). */
export function checkRunsOn(
  context: Context,
  tables: ResolvedTable[],
  originOf: (table: ResolvedTable) => Source | undefined,
): void {
  const runsOn = context.runsOn;
  if (!runsOn) return;
  for (const table of tables)
    for (const [action, step] of [
      ["transform", table.transform],
      ["store", table.store],
    ] as const)
      if (step && step.pack !== runsOn.id)
        context.reporter.error(
          "RUNS_ON",
          `The ${action} "${step.method}" runs on ${step.pack}, not ${runsOn.id}; in ${context.environment}, the table's store and transforms must be ${runsOn.id}'s.`,
          originOf(table),
        );
}
