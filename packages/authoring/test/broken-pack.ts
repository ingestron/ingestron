// A pack the CLI's list gains for a test: its list of Platform fields names one the
// Platform document does not have, so resolution throws, as for a pack's own mistake.
import { packs } from "@ingestron/core";

const count = packs.length;

/** What resolution throws for the broken pack. */
export const brokenPackMessage =
  'The pack "broken" lists the platform field "schedule.nowhere", which the Platform document does not have.';

/** Adds the broken pack to the CLI's packs. */
export function breakPacks(): void {
  packs.push({ ...packs[0]!, id: "broken", platformFields: ["schedule.nowhere"] });
}

/** Takes the broken pack away again. */
export function mendPacks(): void {
  packs.splice(count);
}
