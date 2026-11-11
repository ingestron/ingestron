// The passport's lines for a table's masked columns and row filters (spec/cli/passport.md,
// "Access"): each in words, and on which engine it is enforced or why it is not.
import type { ColumnMask, RowFilter } from "@ingestron/definitions";
import { code } from "./passport-sections.js";

/** Whether an item is enforced on one engine, and if not, why. */
export interface Verdict {
  engine: string;
  /** Why it is not enforced, without a closing full stop; absent when it is. */
  reason?: string;
}

/** `, on <engine>` where it is enforced, `. Not enforced on <engine>: <reason>` where not. */
function enforced(verdicts: readonly Verdict[]): string {
  return verdicts
    .map(({ engine, reason }) =>
      reason === undefined ? `, on ${engine}` : `. Not enforced on ${engine}: ${reason}`,
    )
    .join("");
}

const maskWords: Record<string, string> = {
  null: "shown as no value",
  hash: "hashed",
  redact: "redacted",
};

/** A masked column: its classification, the mask in words, and where it is enforced. */
export function maskLine(mask: ColumnMask, verdicts: readonly Verdict[]): string {
  const words =
    typeof mask.mask === "string" ? maskWords[mask.mask] : `masked by ${code(mask.mask.function)}`;
  return `- ${code(mask.column)} (${mask.classification}): ${words}${enforced(verdicts)}.`;
}

/** A row filter: its function and column, and where it is enforced. */
export function filterLine(filter: RowFilter, verdicts: readonly Verdict[]): string {
  const words = `${code(filter.function)} decides which rows each reader sees, from ${code(filter.column)}`;
  return `- ${code(filter.name)}: ${words}${enforced(verdicts)}.`;
}
