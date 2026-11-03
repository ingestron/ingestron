// What the packs add once the tables resolve: where each step's data lands, and
// each pack's own checks on the whole model.
import type { Context } from "./context.js";
import type { ResolvedModel, ResolvedTable } from "./model.js";
import { holdsPlaceholder } from "./unknown-values.js";

/**
 * Each pack's checks on the whole model (`PACK_CHECK`), reported at the platform. Not
 * run on a model that holds a placeholder: what a check judges cannot be told apart.
 */
export function runPackCheck(context: Context, model: ResolvedModel): void {
  if (holdsPlaceholder(context.project, model)) return;
  const at = context.platform && { document: context.platform, pointer: "" };
  for (const message of context.packs.flatMap((pack) => pack.check?.(model) ?? []))
    context.reporter.error("PACK_CHECK", `${message}.`, at);
}

/** Records where each step's data lands, when its method says (`output`). */
export function recordOutputs(context: Context, tables: ResolvedTable[]): void {
  for (const table of tables) {
    for (const step of [table.ingest, table.transform, table.store, table.serve]) {
      const output = step && context.pack.methods[step.method]?.output?.(table);
      if (step && output) step.output = output;
    }
  }
}
