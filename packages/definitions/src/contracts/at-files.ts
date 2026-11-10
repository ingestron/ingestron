// A table that ends at the landed files: nothing checks its rows, so each check its
// contract or flow table gives is `NOT_APPLIED` on the ingest step's pack (specification
// section 6).
import type { Context } from "../context/index.js";
import type { Source } from "../diagnostics/index.js";
import { tableCheckOf } from "../pack/index.js";
import {
  AT_FILES,
  nameOf,
  notChecked,
  rulesOf,
  unchecked,
  type Entry,
  type Rule,
  type UncheckedRule,
} from "./quality-notes.js";
import { rowCheck } from "./quality-rules.js";

/**
 * Each rule of the contract object that is a check of each row or a table check is
 * `NOT_APPLIED` on `pack`, the ingest step's; a rule that cannot be checked as written warns
 * as on any table; a text rule is kept in words.
 */
export function notCheckedAtFiles(
  context: Context,
  entry: Entry,
  at: Source,
  pack: string,
): UncheckedRule[] {
  const note = (column: string | undefined, rule: Rule, pointer: string) =>
    atFilesRule(context, { entry: entry.name, column, rule }, { ...at, pointer }, pack);
  return [
    ...rulesOf(entry.quality).map((rule, index) =>
      note(undefined, rule, `${at.pointer}/quality/${index}`),
    ),
    ...(entry.properties ?? []).flatMap((property, column) =>
      rulesOf(property.quality).map((rule, index) =>
        note(property.name, rule, `${at.pointer}/properties/${column}/quality/${index}`),
      ),
    ),
  ];
}

/** One rule on a table that ends at the landed files, and why nothing checks it. */
function atFilesRule(
  context: Context,
  { entry, column, rule }: { entry: string; column: string | undefined; rule: Rule },
  at: Source,
  pack: string,
): UncheckedRule {
  const name = nameOf(column ?? entry, rule);
  const kind = column === undefined ? undefined : rowCheck(column, rule)?.rule?.kind;
  const counted = tableCheckOf(rule, name, column, "warn") !== undefined;
  // A text rule is kept in words; one that cannot be checked as written warns as anywhere.
  if (rule.type === "text" || (!kind && !counted))
    return notChecked(context, { rule, name }, at, false);
  const label = typeof rule.metric === "string" ? `"${rule.metric}"` : String(rule.type);
  notAppliedAtFiles(context, `The ${label} rule`, pack, at, kind ?? "table-checks");
  return unchecked(name, rule, AT_FILES.replace(/\.$/, ""));
}

/** `NOT_APPLIED` for a check on a table that ends at the landed files, which nothing checks. */
export function notAppliedAtFiles(
  context: Context,
  what: string,
  pack: string,
  at: Source,
  feature: string,
): void {
  context.reporter.warning(
    "NOT_APPLIED",
    `${what} isn't applied on ${pack}: ${AT_FILES}`,
    at,
    "Add a store step to have it checked.",
    undefined,
    { feature },
  );
}
