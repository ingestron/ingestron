// Judging a table's cleansing and deduplicate (specification sections 6.1 and 11.7): each
// operation it writes, and each the standard gives it, against the step that keeps the table,
// `NOT_APPLIED` where that step does not apply it.
import type { Context } from "../context/index.js";
import { holdsUnsetEnvvar, type Source } from "../diagnostics/index.js";
import type { ResolvedTable } from "../pack/index.js";
import { placeOf, type Operation, type OwnCleanse } from "./cleanse-checks.js";
import { reportJudgement } from "./judge.js";
import { stepsOf } from "./judgements.js";
import { judgeOf } from "./judging-step.js";
import { intentUseOf } from "../intent/index.js";
import { appliesValue, judgementOf, type Judged } from "./quality-judging.js";

/** Which operations a table's cleansing has, and where each came from. */
export interface UsedOperations {
  /** Operations that reached at least one column from the standard's defaults. */
  fromStandard: Set<"trim" | "empty" | "timezone">;
  /** The operations the table writes, by column, in the contract's order. */
  written: { column: string; operation: Operation }[];
}

/**
 * True when the step that keeps the table applies time zone conversion (`cleanse.timezone` is
 * `used`), so that the table's timestamps are in the zones it converts to. A table that ends at
 * the landed files is converted by nothing. A table whose steps cannot be judged yet, because
 * it holds an unset reference, is taken to do what it says.
 */
export function appliesTimezone(context: Context, table: ResolvedTable): boolean {
  if (table.endsAtFiles) return false;
  if (!context.deployTime && holdsUnsetEnvvar(context.project, table)) return true;
  const keeper = judgeOf("cleanse.timezone", stepsOf(context, table));
  const item = { path: "cleanse.timezone", value: "true" };
  return keeper !== undefined && appliesValue(context, keeper, item, table.does);
}

/**
 * The zones the step that keeps the table cannot convert from or to, each with its reason: the
 * `zonesNotApplied` of its `cleanse.timezone` entry, where it applies conversion; else none.
 */
export function zonesNotApplied(
  context: Context,
  table: ResolvedTable,
): Readonly<Record<string, string>> {
  if (!appliesTimezone(context, table)) return {};
  const keeper = judgeOf("cleanse.timezone", stepsOf(context, table));
  if (!keeper) return {};
  const pack = context.packs.find((candidate) => candidate.id === keeper.pack);
  const use =
    intentUseOf(keeper.method, "cleanse.timezone", "true") ??
    (pack && intentUseOf(pack, "cleanse.timezone", "true"));
  return use?.use === "used" ? (use.zonesNotApplied ?? {}) : {};
}

/** The listed zone a conversion is from, else to; undefined when neither is listed. */
export function unconvertedZone(
  zones: { from: string; to: string },
  listed: Readonly<Record<string, string>>,
): string | undefined {
  return [zones.from, zones.to].find((zone) => Object.hasOwn(listed, zone));
}

/**
 * `NOT_APPLIED` for each conversion from or to a zone the keeping step cannot convert: at the
 * column's `timezone` when the table writes it, else once for each zone at the standard's
 * `cleanse.timestamps`.
 */
function judgeZones(context: Context, table: ResolvedTable, what: ToJudge): void {
  const listed = zonesNotApplied(context, table);
  if (Object.keys(listed).length === 0) return;
  const pack = judgeOf("cleanse.timezone", stepsOf(context, table))!.pack;
  const written = new Set(
    what.used.written.filter((item) => item.operation === "timezone").map((item) => item.column),
  );
  const fromStandard = new Set<string>();
  for (const [column, operations] of Object.entries(table.cleanse?.columns ?? {})) {
    const zone = operations.timezone && unconvertedZone(operations.timezone, listed);
    if (zone === undefined) continue;
    if (!written.has(column)) fromStandard.add(zone);
    else reportZone(context, pack, listed[zone]!, placeOf(what.own, "columns", column, "timezone"));
  }
  const standard = { document: context.standard, pointer: standardKey("timezone") };
  for (const zone of fromStandard) reportZone(context, pack, listed[zone]!, standard);
}

function reportZone(context: Context, pack: string, reason: string, at: Source): void {
  context.reporter.warning(
    "NOT_APPLIED",
    `Time zone conversion isn't applied on ${pack}: ${reason}`,
    at,
    undefined,
    undefined,
    { feature: "cleanse.timezone" },
  );
}

/** What to judge: the table's own cleansing, its operations and whether its deduplicate. */
interface ToJudge {
  own: OwnCleanse;
  used: UsedOperations;
  deduplicate: boolean;
}

/**
 * Reports each operation the keeping step does not apply: the standard's, once for the table
 * at the default's key, then each the table writes at its key, then deduplicate. On a table
 * that ends at the landed files nothing cleanses, so each it writes is not applied on the
 * ingest step's pack.
 */
export function judgeCleansing(context: Context, table: ResolvedTable, what: ToJudge): void {
  const items = judgedItems(context, table, what);
  if (table.endsAtFiles) return items.forEach((item) => atFiles(context, table, item));
  if (!context.deployTime && holdsUnsetEnvvar(context.project, table)) return;
  const keeper = judgeOf("cleanse.trim", stepsOf(context, table));
  if (!keeper) return;
  for (const item of items) {
    const judgement = judgementOf(context, keeper, item, table.does);
    if (judgement) reportJudgement(context, judgement, item.at);
  }
  judgeZones(context, table, what);
}

function judgedItems(context: Context, table: ResolvedTable, { own, used, deduplicate }: ToJudge) {
  const item = (path: string, what: string, at: Source): Judged => ({
    path,
    value: "true",
    what,
    at,
    feature: path,
  });
  const standard = (["timezone", "trim", "empty"] as const)
    .filter((operation) => used.fromStandard.has(operation))
    .map((operation) =>
      item(`cleanse.${operation}`, `Cleansing "${operation}" of ${columnsOf(operation)} columns`, {
        document: context.standard,
        pointer: standardKey(operation),
      }),
    );
  const written = used.written.map(({ column, operation }) =>
    item(
      `cleanse.${operation}`,
      `Cleansing "${operation}" of "${column}"`,
      placeOf(own, "columns", column, operation),
    ),
  );
  const dedupe = deduplicate
    ? [item("deduplicate", "Deduplicate", placeOf(own, "deduplicate"))]
    : [];
  return [...standard, ...written, ...dedupe];
}

/** The kind of columns the standard's default for the operation reaches. */
function columnsOf(operation: "trim" | "empty" | "timezone"): string {
  return operation === "timezone" ? "timestamp" : "text";
}

/** Where the standard writes its default for the operation. */
function standardKey(operation: "trim" | "empty" | "timezone"): string {
  return operation === "timezone" ? "/cleanse/timestamps/to" : `/cleanse/text/${operation}`;
}

/** `NOT_APPLIED` for an operation on a table that ends at the landed files. */
function atFiles(context: Context, table: ResolvedTable, item: Judged): void {
  const pack = table.ingest?.pack;
  if (pack === undefined || item.at === undefined) return;
  context.reporter.warning(
    "NOT_APPLIED",
    `${item.what} isn't applied on ${pack}: the table ends at the landed files, and nothing cleanses them.`,
    item.at,
    "Add a store step to have it cleansed.",
    undefined,
    { feature: item.feature ?? item.path },
  );
}
