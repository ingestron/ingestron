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

/**
 * Where an intent value came from, in words: the layer that set it and where it was written;
 * for a value read from an aliased method setting, that setting too.
 */
export function intentFrom(origin: Origin, table: ResolvedTable): string {
  const where = origin.file ? ` (${origin.file}:${origin.line})` : "";
  const layer = {
    pack: "the pack's default",
    standard: "the standard",
    platform: "the platform",
    layer: "the table's layer in the standard",
    rule: "a standard rule",
    definition: table.origin.kind === "Flow" ? "the flow" : "the transform",
    table: "this table",
    fixed: "the standard, fixed",
  }[origin.layer];
  return origin.alias ? `the setting "${origin.alias}" in ${layer}${where}` : `${layer}${where}`;
}
