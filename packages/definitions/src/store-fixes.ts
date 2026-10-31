// Ways out when nothing chooses a flow's store method (specification section 4).
import type { Fix } from "@ingestron/config";
import { NO_STORE, type Named } from "./choose.js";
import type { Context } from "./context.js";
import type { PackInfo } from "./pack.js";

/** End at the landed files (this flow or every flow), or add a pack that stores files. */
export function storeFixes(context: Context, named: Named): Fix[] {
  const standard = context.standard.file;
  const ends: Fix[] = [
    {
      title: "End this flow at the landed files",
      edits: [{ file: named.owner.file, pointer: "/store/uses", set: NO_STORE }],
    },
    {
      title: "End every flow at the landed files",
      edits: [{ file: standard, pointer: "/store/default", set: NO_STORE }],
    },
  ];
  const packs = context.available
    .filter((pack) => !context.packs.some((own) => own.id === pack.id) && storesFiles(pack))
    .map((pack) => ({
      title: `Add the "${pack.id}" pack`,
      edits: [{ file: standard, pointer: "/packs/-", set: `${pack.id}@${pack.version}` }],
    }));
  return [...ends, ...packs];
}

function storesFiles(pack: PackInfo): boolean {
  return Object.values(pack.methods).some(
    (method) => method.action === "store" && method.accepts?.includes("files"),
  );
}
