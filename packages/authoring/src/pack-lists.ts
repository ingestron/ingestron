// The packs a standard can list, as values to complete.
import { packs } from "@ingestron/cli";
import type { Suggestion } from "./completion.js";

/** Every pack as `<id>@<version>`, the first pack of a standard first. */
export function packIds(): string[] {
  return packs.map((pack) => `${pack.id}@${pack.version}`);
}

/**
 * A standard's packs: each pack alone, then each pack that stores tables with
 * each pack that only lands files, the storing pack first, since the first
 * gives the defaults.
 */
export function packLists(): Suggestion[] {
  const id = (pack: (typeof packs)[number]) => `${pack.id}@${pack.version}`;
  const stores = (pack: (typeof packs)[number]) =>
    Object.values(pack.methods).some((method) => method.action === "store");
  const pairs = packs
    .filter(stores)
    .flatMap((store) =>
      packs.filter((pack) => !stores(pack)).map((lands) => [id(store), id(lands)]),
    );
  // Alone, a pack must read a source itself: Synapse, say, only serves what another lands.
  const readsSources = (pack: (typeof packs)[number]) =>
    Object.values(pack.methods).some(
      (method) => method.action === "ingest" && (method.connectors?.length ?? 0) > 0,
    );
  const singles = packs.filter(readsSources).map((pack) => [id(pack)]);
  return [...singles, ...pairs].map((list, index) => ({
    label: `[${list.join(", ")}]`,
    kind: "value" as const,
    ...(index === 0 && { preselect: true }),
  }));
}
