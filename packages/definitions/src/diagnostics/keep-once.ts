// Keeping each problem once: one found again for another table is about several tables
// (specification section 1.2).
import type { AnyDiagnostic } from "@ingestron/config";
import type { Diagnostic, DiagnosticSubject } from "./diagnostics.js";

/** Adds the diagnostic with its subject, unless one that differs only in its table is kept. */
export function keepOnce(
  seen: Map<string, Diagnostic>,
  diagnostics: Diagnostic[],
  diagnostic: AnyDiagnostic,
  about: DiagnosticSubject | undefined,
): void {
  const key = JSON.stringify({ ...diagnostic, feature: about?.feature });
  const kept = seen.get(key);
  if (kept) return aboutSeveral(kept, about);
  const reported = about ? { ...diagnostic, subject: about } : diagnostic;
  seen.set(key, reported);
  diagnostics.push(reported);
}

/** The subject with only the keys it gives; undefined when it gives none. */
export function subjectOf(subject: DiagnosticSubject | undefined): DiagnosticSubject | undefined {
  const table = subject?.table;
  const feature = subject?.feature;
  if (table === undefined && feature === undefined) return undefined;
  return { ...(table !== undefined && { table }), ...(feature !== undefined && { feature }) };
}

/** A diagnostic found again for another table, or for none, is no longer about one table. */
function aboutSeveral(kept: Diagnostic, about: DiagnosticSubject | undefined): void {
  if (kept.subject?.table === undefined || kept.subject.table === about?.table) return;
  const feature = kept.subject.feature;
  if (feature === undefined) delete kept.subject;
  else kept.subject = { feature };
}
