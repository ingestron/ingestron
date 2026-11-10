// A table's quarantine and results, and where its check actions were written (specification
// sections 11.2 and 11.7): the standard's `quality`, over which the table's layer's applies,
// over which the table's own applies, with `LAYER_RESPONSIBILITY` for quarantine its layer does
// not do, `QUARANTINE_UNUSED` where no check drops rows, and quarantine judged against the pack
// that keeps the table.
import type { Context } from "../context/index.js";
import { actionPlace, layerObject, notAppliedAtFiles } from "../contracts/index.js";
import { holdsUnsetEnvvar, type Source } from "../diagnostics/index.js";
import type { QuarantineDoc } from "../intent/index.js";
import type { Origin, ResolvedTable } from "../pack/index.js";
import { reportJudgement } from "./judge.js";
import { stepsOf } from "./judgements.js";
import { judgeOf } from "./judging-step.js";
import { listsDuty, requireDuty } from "./layer-duties.js";
import { judgementOf } from "./quality-judging.js";

/** What a flow table or transform writes of its quarantine and results, and where. */
export interface OwnQuality {
  doc: QuarantineDoc | undefined;
  /** The `quality` mapping, written or not. */
  at: Source;
  /** `table` for a flow table, `definition` for a transform. */
  origin: "table" | "definition";
}

/** The values that are merged from the standard, the layer and the table. */
type Key = "quarantine" | "results";

/** One place that says a value: who wrote it, the value, and where. */
interface Say {
  origin: Origin["layer"];
  value: boolean;
  at: Source;
}

const places = new WeakMap<ResolvedTable, Partial<Record<Key, Source>>>();

/** Where the table's `quality.<key>` that applies was written; undefined when none was. */
export function qualityPlace(table: ResolvedTable, key: Key): Source | undefined {
  return places.get(table)?.[key];
}

/**
 * Gives the table its `quality`, `qualityOrigins` and, where rows that fail a check are kept
 * in a table of their own, its `quarantine`; reports what is wrong with them.
 */
export function applyQuality(context: Context, table: ResolvedTable, own: OwnQuality): void {
  const quarantine = lastSay(says(context, table, own, "quarantine"));
  const results = lastSay(says(context, table, own, "results"));
  const written = { ...(quarantine && { quarantine }), ...(results && { results }) };
  const values = Object.entries(written).map(([key, say]) => [key, say.value]);
  if (values.length > 0) table.quality = Object.fromEntries(values) as ResolvedTable["quality"];
  const origins = { ...actionOrigins(context, table.layer), ...originsOf(written) };
  if (Object.keys(origins).length > 0) table.qualityOrigins = origins;
  places.set(table, Object.fromEntries(Object.entries(written).map(([k, say]) => [k, say.at])));
  if (quarantine?.value) keepQuarantine(context, table, quarantine);
}

/** The say that wins: the last one. */
function lastSay(said: Say[]): Say | undefined {
  return said[said.length - 1];
}

/** The origin of each value that was said. */
function originsOf(found: Partial<Record<Key, Say>>): NonNullable<ResolvedTable["qualityOrigins"]> {
  return Object.fromEntries(Object.entries(found).map(([key, say]) => [key, originOf(say)]));
}

/** The origin of each action the standard or the layer writes for the table's checks. */
function actionOrigins(
  context: Context,
  layer: string,
): NonNullable<ResolvedTable["qualityOrigins"]> {
  const origins: NonNullable<ResolvedTable["qualityOrigins"]> = {};
  for (const key of ["required", "default"] as const) {
    const at = actionPlace(context, layer, key);
    if (!at) continue;
    const written = layerObject(context, layer)?.layer.quality?.[key] !== undefined;
    origins[key] = originOf({ origin: written ? "layer" : "standard", value: true, at });
  }
  return origins;
}

function originOf({ origin, at }: Say): Origin {
  const { file, line } = at.document.locate(at.pointer);
  return { layer: origin, file, line };
}

/**
 * What the standard, the table's layer and the table say of the value, in that order. For
 * quarantine, the standard's says only for a table in a layer that does it (and not one that
 * ends at the landed files), and a `true` the layer or the table writes where the layer does
 * not do it is `LAYER_RESPONSIBILITY`, and says nothing.
 */
function says(context: Context, table: ResolvedTable, own: OwnQuality, key: Key): Say[] {
  return [
    standardSay(context, table, key),
    layerSay(context, table, key),
    ownSay(context, table, own, key),
  ].filter((say) => say !== undefined);
}

function standardSay(context: Context, table: ResolvedTable, key: Key): Say | undefined {
  const value = context.standard.value.quality?.[key];
  const reached =
    key !== "quarantine" || (listsDuty(table.does, "quarantine") && !table.endsAtFiles);
  if (value === undefined || !reached) return undefined;
  return {
    origin: "standard",
    value,
    at: { document: context.standard, pointer: `/quality/${key}` },
  };
}

function layerSay(context: Context, table: ResolvedTable, key: Key): Say | undefined {
  const found = layerObject(context, table.layer);
  const value = found?.layer.quality?.[key];
  if (found === undefined || value === undefined) return undefined;
  const at = { document: context.standard, pointer: `/layers/${found.index}/quality/${key}` };
  return granted(context, table, { key, value, at }) ? { origin: "layer", value, at } : undefined;
}

function ownSay(
  context: Context,
  table: ResolvedTable,
  own: OwnQuality,
  key: Key,
): Say | undefined {
  const value = own.doc?.[key];
  if (value === undefined) return undefined;
  const at = { ...own.at, pointer: `${own.at.pointer}/${key}` };
  return granted(context, table, { key, value, at })
    ? { origin: own.origin, value, at }
    : undefined;
}

/** False, after reporting, when `true` quarantine is written where the table's layer does not do it. */
function granted(
  context: Context,
  table: ResolvedTable,
  { key, value, at }: { key: Key; value: boolean; at: Source },
): boolean {
  return (
    key !== "quarantine" || !value || requireDuty(context, table, "quarantine", "quarantine", at)
  );
}

/**
 * The table's quarantine table when a check drops rows and it is a table (not the landed files),
 * else `QUARANTINE_UNUSED` when no check drops (the standard's own quarantine is silent there);
 * then judges quarantine against the pack that keeps the table.
 */
function keepQuarantine(context: Context, table: ResolvedTable, say: Say): void {
  const { at } = say;
  if (!table.expectations.some((expectation) => expectation.action === "drop")) {
    // Only a quarantine written on the table or its layer is worth a warning; the standard's
    // reaches tables whose author it cannot know.
    if (say.origin === "standard") return;
    context.reporter.warning(
      "QUARANTINE_UNUSED",
      "No check drops rows, so nothing is quarantined.",
      at,
      "Set a check's action to drop, or remove quarantine.",
    );
    return;
  }
  if (!table.endsAtFiles) {
    const { fullName } = table;
    table.quarantine = {
      fullName: { ...fullName, table: `${fullName.table}_quarantine` },
      column: "_failed_checks",
    };
  }
  judgeQuarantine(context, table, at);
}

/** `NOT_APPLIED` where the step that keeps the table does not apply quarantine. */
function judgeQuarantine(context: Context, table: ResolvedTable, at: Source): void {
  if (table.endsAtFiles) {
    const pack = table.ingest?.pack;
    if (pack !== undefined) notAppliedAtFiles(context, "Quarantine", pack, at, "quarantine");
    return;
  }
  if (!context.deployTime && holdsUnsetEnvvar(context.project, table)) return;
  const keeper = judgeOf("quality.quarantine", stepsOf(context, table));
  if (!keeper) return;
  const item = {
    path: "quality.quarantine",
    value: "true",
    what: "Quarantine",
    at,
    feature: "quarantine",
  };
  const judgement = judgementOf(context, keeper, item, table.does);
  if (judgement) reportJudgement(context, judgement, at);
}
