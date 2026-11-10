// Reporting what access judging found (specification section 8.2): one warning for each
// declaring line, code, feature, pack and reason, naming every table it is about, so a role
// that many tables share is reported once, not once per table.
import type { Context } from "../context/index.js";
import { warnOff } from "../context/index.js";
import type { Source } from "../diagnostics/index.js";
import type { Capability } from "../pack/index.js";

/** One role, mask or filter of one table that its keeping pack does not apply, or has off. */
export interface Finding {
  code: "NOT_APPLIED" | "CAPABILITY_OFF";
  /** The declaring line; unknown when the contract's entry is not known. */
  at: Source | undefined;
  /** What messages call it, such as `Access for the role "auditors"`. */
  what: string;
  /** The subject's feature: `grants`, `write`, `exact`, `masks` or `filters`. */
  feature: string;
  /** The capability that turns it on. */
  capability: Capability["id"];
  /** The keeping pack's id. */
  pack: string;
  /** For `NOT_APPLIED`, the pack's reason. */
  reason?: string;
  /** For a mask, the column it is not applied to. */
  column?: string;
  table: string;
}

/** Reports the findings, one for each declaring line, code, feature, pack and reason. */
export function reportFindings(context: Context, findings: Finding[]): void {
  const groups = new Map<string, Finding[]>();
  for (const finding of findings) {
    const key = JSON.stringify([
      finding.code,
      finding.at?.document.file,
      finding.at?.pointer,
      finding.feature,
      finding.pack,
      finding.reason,
      finding.what,
    ]);
    groups.set(key, [...(groups.get(key) ?? []), finding]);
  }
  for (const group of groups.values()) reportGroup(context, group);
}

function reportGroup(context: Context, group: Finding[]): void {
  const [first] = group as [Finding, ...Finding[]];
  const tables = [...new Set(group.map((finding) => finding.table))];
  const named = tables.length === 1 ? `table "${tables[0]}"` : `tables ${quoted(tables)}`;
  const table = tables.length === 1 ? tables[0] : undefined;
  if (first.code === "CAPABILITY_OFF") {
    if (!first.at) return;
    const message = `${first.what} in ${named} is not applied`;
    warnOff(
      context,
      first.capability,
      message,
      first.at.document,
      first.at.pointer,
      table,
      first.pack,
    );
    return;
  }
  const reason = first.reason ?? "";
  const detail = { reason, ...(first.column !== undefined && { columns: [first.column] }) };
  for (const name of tables) context.reporter.noteNotApplied(name, first.feature, detail);
  context.reporter.warning(
    "NOT_APPLIED",
    `${first.what} in ${named} isn't applied on ${first.pack}: ${reason}`,
    first.at,
    undefined,
    undefined,
    { ...(table !== undefined && { table }), feature: first.feature },
    detail,
  );
}

function quoted(names: string[]): string {
  return names.map((name) => `"${name}"`).join(", ");
}
