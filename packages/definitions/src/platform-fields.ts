// The Platform fields each pack says it reads (specification section 7): every
// path must be the path of an entry of the Platform's field reference, or the
// pack is refused.
import type { PackInfo } from "./pack.js";
import { documentReference } from "./reference.js";

let known: ReadonlySet<string> | undefined;

/** Each entry's path in the Platform's field reference, keys joined with `.`; read once. */
function platformPaths(): ReadonlySet<string> {
  known ??= new Set(documentReference("Platform").map((field) => field.path.join(".")));
  return known;
}

/**
 * Throws for the first path a pack lists in `platformFields`, in the order the packs are
 * given, that is not the path of an entry of the Platform's field reference. A pack's list
 * is its own mistake, not the project's, so it is not a diagnostic: whatever tool gives the
 * pack to resolution stops with it.
 */
export function checkPlatformFields(packs: readonly PackInfo[]): void {
  for (const pack of packs) {
    const unknown = (pack.platformFields ?? []).find((path) => !platformPaths().has(path));
    if (unknown !== undefined)
      throw new Error(
        `The pack "${pack.id}" lists the platform field "${unknown}", which the Platform document does not have.`,
      );
  }
}
