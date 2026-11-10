// Judging a table's checks (specification section 11.7): each rule kind, action and table
// check against the step that keeps the table, `NOT_APPLIED` where it is not applied,
// including where a pack applies it only in a layer with a duty this table's layer lacks.
import type { Context } from "../context/index.js";
import {
  actionPlace,
  expectationPlaces,
  layerObject,
  tableCheckPlaces,
  type ExpectationPlace,
} from "../contracts/index.js";
import { holdsUnsetEnvvar, type Source } from "../diagnostics/index.js";
import type { ExpectationDoc } from "../documents/index.js";
import { intentUseOf, type IntentUse } from "../intent/index.js";
import type { ResolvedTable } from "../pack/index.js";
import { reportJudgement } from "./judge.js";
import {
  outcomeOfUse,
  stepsOf,
  type Judgement,
  type JudgingStep,
  type Outcome,
} from "./judgements.js";
import { judgeOf } from "./judging-step.js";

/** A flow table's or transform's own expectations, and where the list was written. */
export interface OwnExpectations {
  docs: ExpectationDoc[] | undefined;
  at: Source;
}

/**
 * One value judged: its path and value, what messages call it, and where it was written.
 * `feature` is what the warning's subject names, when that is not the value.
 */
export interface Judged {
  path: string;
  value: string;
  what: string;
  at: Source | undefined;
  feature?: string;
}

/**
 * Judges the table's checks against the step that keeps it: each expectation's rule kind
 * and action, then each table check and its action. A table that ends at the landed files,
 * whose steps are not known, or that holds an unset reference (outside deploy) is not
 * judged here.
 */
export function judgeQuality(context: Context, table: ResolvedTable, own: OwnExpectations): void {
  if (table.endsAtFiles || (!context.deployTime && holdsUnsetEnvvar(context.project, table)))
    return;
  const keeper = judgeOf("quality.rules", stepsOf(context, table));
  if (!keeper) return;
  for (const item of judgedValues(context, table, own, keeper)) {
    const judgement = judgementOf(context, keeper, item, table.does);
    if (judgement) reportJudgement(context, judgement, item.at);
  }
}

/** What the keeping step's method, else its pack, says of the value, when a project hears it. */
export function judgementOf(
  context: Context,
  keeper: JudgingStep,
  item: Judged,
  does: ResolvedTable["does"],
): Judgement | undefined {
  const use = intentUseOf(keeper.method, item.path, item.value) ?? packUse(context, keeper, item);
  const where = use && whereOutcome(use, does);
  const outcome: Outcome | undefined = where
    ? { kind: "not-applied", reason: where.reason }
    : use && outcomeOfUse(use);
  if (!outcome) return undefined;
  return {
    path: item.path,
    value: item.value,
    text: item.value,
    pack: keeper.pack,
    outcome,
    what: item.what,
    feature: item.feature ?? (item.path === "quality.table-checks" ? "table-checks" : item.value),
    ...(where && { hint: where.hint }),
  };
}

/**
 * True when the keeping step's method, else its pack, says it applies the value (`used`), and
 * the table's `does` has the duty the entry asks for, if any.
 */
export function appliesValue(
  context: Context,
  keeper: JudgingStep,
  item: Pick<Judged, "path" | "value">,
  does: ResolvedTable["does"],
): boolean {
  const pack = context.packs.find((candidate) => candidate.id === keeper.pack);
  const use =
    intentUseOf(keeper.method, item.path, item.value) ??
    (pack && intentUseOf(pack, item.path, item.value));
  return use?.use === "used" && whereOutcome(use, does) === undefined;
}

function packUse(context: Context, keeper: JudgingStep, item: Judged): IntentUse | undefined {
  const pack = context.packs.find((candidate) => candidate.id === keeper.pack);
  return pack && intentUseOf(pack, item.path, item.value);
}

/**
 * The values judged, in order: each expectation's kind and action, then each table check and
 * its action. An expectation's action is left out when its kind is not applied, and when
 * nothing wrote it and the expectation has no rule; one that nothing wrote is judged at the
 * rule.
 */
function judgedValues(
  context: Context,
  table: ResolvedTable,
  own: OwnExpectations,
  keeper: JudgingStep,
): Judged[] {
  const places = expectationPlaces(context, table.contract, own.docs, own.at, table.layer);
  const expectations = table.expectations.flatMap((expectation, index) => {
    const place: ExpectationPlace = places[index] ?? {};
    const kind = expectation.rule?.kind;
    if (!kind) return place.action ? [actionOf(expectation.action, place.action)] : [];
    const rule = { path: "quality.rules", value: kind, what: `The ${kind} rule`, at: place.rule };
    const unapplied =
      judgementOf(context, keeper, rule, table.does)?.outcome.kind === "not-applied";
    return unapplied ? [rule] : [rule, actionOf(expectation.action, place.action ?? place.rule)];
  });
  return [...expectations, ...tableCheckValues(context, table, keeper)];
}

/**
 * Each table check and its action, which is judged against `quality.table-checks` too: a
 * pack that runs table checks runs each with its action. The action is left out when the
 * table check is not applied, and when it has no place: at the quality default that wrote
 * it, else at the table check.
 */
function tableCheckValues(context: Context, table: ResolvedTable, keeper: JudgingStep): Judged[] {
  const tableAt = tableCheckPlaces(table.contract);
  const written =
    layerObject(context, table.layer)?.layer.quality?.default ??
    context.standard.value.quality?.default;
  return table.contract.tableChecks.flatMap((check, index) => {
    const item = {
      path: "quality.table-checks",
      value: "true",
      what: "The table check",
      at: tableAt[index],
    };
    const unapplied =
      judgementOf(context, keeper, item, table.does)?.outcome.kind === "not-applied";
    const at =
      (check.action === written ? actionPlace(context, table.layer, "default") : undefined) ??
      tableAt[index];
    if (unapplied || !at) return [item];
    return [item, { ...item, what: `The ${check.action} action`, at, feature: check.action }];
  });
}

function actionOf(action: string, at: Source | undefined): Judged {
  return { path: "quality.actions", value: action, what: `The ${action} action`, at };
}

/**
 * When a `used` entry applies its value only in a layer with a duty (`onlyWhere`) that the
 * table's `does` does not list: why it is not applied, and the hint that names the duty.
 * Undefined when the entry applies it here, or says nothing of a duty.
 */
export function whereOutcome(
  use: IntentUse,
  does: ResolvedTable["does"],
): { reason: string; hint: string } | undefined {
  if (use.use !== "used" || use.onlyWhere === undefined) return undefined;
  const duty = use.onlyWhere;
  if (Array.isArray(does) && does.includes(duty)) return undefined;
  return {
    reason: `it is applied only in a layer whose does lists ${duty}.`,
    hint: `Add \`${duty}\` to the layer's \`does\` to apply it here.`,
  };
}
