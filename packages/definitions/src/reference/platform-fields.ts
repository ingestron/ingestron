// The Platform fields each pack says it reads (specification section 7): every
// path must be the path of an entry of the Platform's field reference, or the
// pack is refused.
import type { AnyDiagnostic } from "@ingestron/config";
import type { PackInfo } from "../pack/index.js";
import { documentReference } from "./reference.js";

let known: ReadonlySet<string> | undefined;

/** Each entry's path in the Platform's field reference, keys joined with `.`; read once. */
function platformPaths(): ReadonlySet<string> {
  known ??= new Set(documentReference("Platform").map((field) => field.path.join(".")));
  return known;
}

/** Why the packs are refused: the first path a pack lists that the Platform does not have. */
function refusal(packs: readonly PackInfo[]): string | undefined {
  for (const pack of packs) {
    const unknown = (pack.platformFields ?? []).find((path) => !platformPaths().has(path));
    if (unknown !== undefined)
      return `The pack "${pack.id}" lists the platform field "${unknown}", which the Platform document does not have.`;
  }
  return undefined;
}

/**
 * The `PACK_LOAD` error for packs that resolution would refuse, or undefined when every
 * pack can be given to it (specification section 7). A tool checks this first and, given
 * an error, reads, checks and generates nothing. It has no location.
 * @example
 * const problem = packLoadProblem(packs);
 * if (problem) console.error(formatDiagnostics([problem]));
 */
export function packLoadProblem(packs: readonly PackInfo[]): AnyDiagnostic | undefined {
  const message = refusal(packs);
  return message === undefined
    ? undefined
    : {
        code: "PACK_LOAD",
        severity: "error",
        message,
        hint: "This is a mistake in the pack, not in the project, so nothing is checked or generated. Install a version of Ingestron, or of the editor extension, that fixes it.",
      };
}

/**
 * Throws for the first path a pack lists in `platformFields`, in the order the packs are
 * given, that is not the path of an entry of the Platform's field reference. A pack's list
 * is its own mistake, not the project's, so resolution stops with it; a tool checks
 * {@link packLoadProblem} first to report it.
 */
export function checkPlatformFields(packs: readonly PackInfo[]): void {
  const message = refusal(packs);
  if (message !== undefined) throw new Error(message);
}
