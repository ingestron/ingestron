// A pack that cannot be loaded: resolution refuses a pack's own mistake, such as a
// `platformFields` path the Platform does not have (definitions specification,
// section 7). The editor checks first, as the CLI does, and shows the PACK_LOAD
// error in place of resolving; any other error is not caught here.
import { packs } from "@ingestron/core";
import type { AnyDiagnostic } from "@ingestron/config";
import { packLoadProblem } from "@ingestron/definitions";

/** The PACK_LOAD error when one of the CLI's packs cannot be loaded, else undefined. */
export function refusedPacks(): AnyDiagnostic | undefined {
  return packLoadProblem(packs);
}
