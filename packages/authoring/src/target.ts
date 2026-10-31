// Where a table's data ends up, as the editor names it.
import type { ResolvedTable } from "@ingestron/definitions";

/** Its full name, or where its files land when the table ends at the landed files. */
export function targetOf(table: ResolvedTable): string {
  if (!table.endsAtFiles) return Object.values(table.fullName).join(".");
  return table.ingest?.output?.location ?? "the landed files";
}
