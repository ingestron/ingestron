// How a value's origin is said in a hover.
import type { Origin, ResolvedTable } from "@ingestron/definitions";

/** Which layer set a value, in words, with where it was written. */
export function from(origin: Origin | undefined, table: ResolvedTable): string {
  if (!origin) return "";
  const where = origin.file ? ` (${origin.file}:${origin.line})` : "";
  const layer = {
    pack: "pack default",
    standard: "standard",
    platform: "platform",
    layer: "the table's layer in the standard",
    rule: "standard rule",
    definition: table.origin.kind === "Flow" ? "the flow" : "the transform",
    table: "this table",
    fixed: "standard, fixed",
  }[origin.layer];
  return `${layer}${where}`;
}
