// Where a table's data ends up, as the editor names it.
import type { ResolvedTable } from "@ingestron/definitions";

/** Its full name, or where its files land when the table ends at the landed files. */
export function targetOf(table: ResolvedTable): string {
  if (!table.endsAtFiles) return Object.values(table.fullName).join(".");
  return table.ingest?.output?.location ?? "the landed files";
}

/**
 * A line saying the ingest method is not known yet, for a table whose flow's source holds
 * an unset `${envvar:…}` and names no method with `uses`; none for any other table. Such a
 * table has no steps, so no method is named. `markdown` for a hover.
 */
export function stepsNotKnown(table: ResolvedTable, markdown = false): string[] {
  const source = table.ingest ? undefined : table.sourceNotKnown;
  if (source === undefined) return [];
  const quoted = (text: string) => (markdown ? `\`${text}\`` : text);
  const action = markdown ? "**ingest**" : "ingest";
  const reason = `the source is ${quoted(source)}, and no ${quoted("uses")} names it`;
  return [`${action}: not known yet: ${reason}${markdown ? "." : ""}`];
}
