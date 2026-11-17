// A reported problem as a diagnostic, with the place it is written.
import type { AnyDiagnostic, Fix, Severity } from "@ingestron/config";
import type { DefinitionCode, Source } from "./diagnostics.js";

/** The diagnostic for a problem, with its location where `at` is known. */
export function diagnosticOf(
  severity: Severity,
  code: DefinitionCode,
  message: string,
  at?: Source,
  hint?: string,
  fixes?: Fix[],
): AnyDiagnostic {
  const location = at?.document.locate(at.pointer);
  return {
    code,
    severity,
    message,
    ...(hint && { hint }),
    ...(location && { location }),
    ...(fixes && fixes.length > 0 && { fixes }),
  };
}
