// An environment that runs on a pack (specification section 4, "Runs on"):
// another pack's files ingest becomes the pack's landed method, tables that
// land no files are left out, and the rest must be the pack's to run.
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
  const pick = runsOn && peekMethod(context, "ingest", named, facts);
  if (!runsOn || !pick || pick.method.produces !== "files") return undefined;
  if (context.owner.get(pick.id) === runsOn.id) return undefined;
  const landed = Object.keys(runsOn.methods).find((id) => runsOn.methods[id]!.reads === "landed");
  if (!landed) {
    context.reporter.error(
      "RUNS_ON",
      `"${runsOn.id}" has no method that reads landed files, so "${pick.id}" cannot run in ${context.environment}.`,
      { document: named.owner, pointer: "/source" },
    );
    return { step: undefined };
  }
  const step = resolveStep(
    context,
    "ingest",
    { owner: named.owner, doc: { uses: landed }, at: "/source" },
    facts,
  );
  return { step: step && { ...step, chosenBy: { by: "runs-on", pack: runsOn.id } } };
}

/** Under runs-on, true when the table's ingest lands no files: it is left out, with a warning. */
export function leftOut(
  context: Context,
  named: Named,
  facts: Facts,
  table: string,
  at: Source,
): boolean {
  const pick = context.runsOn && peekMethod(context, "ingest", named, facts);
  if (!pick || pick.method.produces !== "table") return false;
  context.reporter.warning(
    "RUNS_ON_SKIPPED",
    `"${table}" is ingested by "${pick.id}", which lands no files, so it is left out of ${context.environment}.`,
    at,
  );
  context.skipped.add(table);
  return true;
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
    for (const step of [table.transform, table.store])
      if (step && step.pack !== runsOn.id)
        context.reporter.error(
          "RUNS_ON",
          `"${step.method}" runs on ${step.pack}, not ${runsOn.id}; in ${context.environment}, the table's store and transforms must be ${runsOn.id}'s.`,
          originOf(table),
        );
}
