// The shape of a code's help, shared by every list of codes.
import type { Severity } from "@ingestron/config";

/**
 * What a code means, how to fix it, and when it is reported (specification, Accepted warnings).
 * @public
 */
export interface CodeHelp {
  /** What the code means. */
  meaning: string;
  /** How to fix it. */
  fix: string;
  /** The levels it is ever reported at; none for a code that is no longer reported. */
  severities: readonly Severity[];
  /** Where it is reported: by loading and resolving, or only by a pack's building of the files. */
  origin: "resolve" | "build";
}
