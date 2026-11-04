// A pack that cannot be loaded: resolution throws for a pack's own mistake, such
// as a `platformFields` path the Platform does not have. The editor shows it as a
// problem in place of stopping.
import type { AnyDiagnostic } from "@ingestron/config";

/** The code of the problem shown when resolution stops on a pack's mistake. */
export const packLoadCode = "PACK_LOAD";

/** What `work` gives, or, when it throws, what `fallback` makes of the problem. */
export function unlessPackThrows<T>(work: () => T, fallback: (problem: AnyDiagnostic) => T): T {
  try {
    return work();
  } catch (error) {
    return fallback(packLoadProblem(error));
  }
}

function packLoadProblem(error: unknown): AnyDiagnostic {
  return {
    code: packLoadCode,
    severity: "error",
    message: error instanceof Error ? error.message : String(error),
    hint: "Ingestron stops on this, so nothing is checked or generated. The project is not the cause: install a version of the pack, or of the editor extension, that fixes it.",
  };
}
