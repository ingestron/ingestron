// What resolving gives back once every check has run.
import type { Reporter } from "../diagnostics/index.js";
import type { ResolvedModel } from "../pack/index.js";
import type { SourceTable } from "../sources/index.js";
import type { Resolution } from "./resolve.js";

/** The model when nothing failed, else not; the diagnostics, and the source tables when listed. */
export function outcome(
  reporter: Reporter,
  model: ResolvedModel | false | undefined,
  sourceTables: SourceTable[] | undefined,
): Resolution {
  const { diagnostics } = reporter;
  const listed = sourceTables && { sourceTables };
  return model && !reporter.failed()
    ? { ok: true, model, diagnostics, ...listed }
    : { ok: false, diagnostics, ...listed };
}
