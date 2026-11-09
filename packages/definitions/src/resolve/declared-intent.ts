// Declared intent per table (specification section 11.2): the layers of the
// precedence except the pack's defaults, merged, with where each value came from.
import type { DefinitionDocument } from "@ingestron/config";
import { matches, type Facts } from "../choose/index.js";
import type { Context } from "../context/index.js";
import { holdsUnsetEnvvar } from "../diagnostics/index.js";
import type { FlowDoc, TransformDoc } from "../documents/index.js";
import type { Intent } from "../intent/index.js";
import type { Origin } from "../pack/index.js";
import { decided, intentOfDocument, intentPointer, leaves, withoutLoad } from "./intent-values.js";
import { mergeStages, type IntentStage } from "./intent-stages.js";
import { changedFixed, reportFixed } from "./fixed-values.js";

/** The layers of intent, as `Origin.layer` names them. */
export type IntentLayer = "pack" | "standard" | "layer" | "rule" | "definition" | "table" | "fixed";

/** The table whose intent is wanted, and the document that declares it. */
export type IntentSubject = { layer: string; facts: Facts } & (
  | { kind: "Flow"; document: DefinitionDocument<FlowDoc>; tableName: string }
  | { kind: "Transform"; document: DefinitionDocument<TransformDoc> }
);

/**
 * A table's declared intent, with the origin of each value, keyed by intent path, and
 * the stages it was merged from, for completing it once methods are chosen.
 */
export interface DeclaredIntent {
  intent: Intent;
  origins: Record<string, Origin>;
  stages: IntentStage[];
}

/**
 * Declared intent: the standard, the table's layer, the matching `load.when` rule,
 * the flow or transform, the flow table and the standard's `fixed`, later winning.
 * A definition that changes a fixed value is `FIXED_SETTING`.
 */
export function declaredIntent(context: Context, subject: IntentSubject): DeclaredIntent {
  const stages = stagesOf(context, subject);
  checkFixed(context, stages);
  const known = stages.map((stage) => ({ ...stage, intent: decided(context, stage.intent) }));
  const { intent, origins } = mergeStages(known);
  return { intent, origins, stages: known };
}

/** The stages in order of precedence; a stage that says nothing is left out. */
function stagesOf(context: Context, subject: IntentSubject): IntentStage[] {
  const { document, layer } = subject;
  const flow = subject.kind === "Flow";
  // A transform's table is not loaded from a source.
  const loaded = (intent: Intent) => (flow ? intent : withoutLoad(intent));
  const written = (base: string) => (path: string) => ({
    document,
    pointer: base + intentPointer(path),
  });
  const stages: IntentStage[] = [
    standardStage(context, loaded),
    ...layerStage(context, layer),
    ...(flow ? ruleStage(context, subject.facts) : []),
    { origin: "definition", intent: intentOfDocument(document.value), at: written("") },
  ];
  if (subject.kind === "Flow") {
    const { tableName } = subject;
    const table = intentOfDocument(subject.document.value.tables[tableName] ?? {});
    stages.push({ origin: "table", intent: table, at: written(`/tables/${tableName}`) });
  }
  const { standard } = context;
  const fixed = loaded(intentOfDocument(standard.value.fixed ?? {}));
  stages.push({
    origin: "fixed",
    intent: fixed,
    at: (path) => ({ document: standard, pointer: `/fixed${intentPointer(path)}` }),
  });
  return stages.filter((stage) => leaves(stage.intent).length > 0);
}

/** The standard's top-level sections, which name the load mode and the deletes differently. */
function standardStage(context: Context, loaded: (intent: Intent) => Intent): IntentStage {
  const { standard } = context;
  const { load, audit, rescued, retention, storage } = standard.value;
  const intent = loaded({
    ...intentOfDocument({ audit, rescued, retention, storage }),
    ...intentOfDocument({ load: { mode: load?.default, deletes: { mode: load?.deletes } } }),
  });
  const pointers: Record<string, string> = {
    "load.mode": "/load/default",
    "load.deletes.mode": "/load/deletes",
  };
  return {
    origin: "standard",
    intent,
    at: (path) => ({ document: standard, pointer: pointers[path] ?? intentPointer(path) }),
  };
}

/** The standard's object for the table's layer, when it is written as one. */
function layerStage(context: Context, name: string): IntentStage[] {
  const { standard } = context;
  const layers = standard.value.layers ?? [];
  const index = layers.findIndex(
    (layer) => (typeof layer === "string" ? layer : layer.name) === name,
  );
  const layer = layers[index];
  if (layer === undefined || typeof layer === "string") return [];
  return [
    {
      origin: "layer",
      intent: intentOfDocument(layer),
      at: (path) => ({ document: standard, pointer: `/layers/${index}${intentPointer(path)}` }),
    },
  ];
}

/** The first `load.when` rule whose facts all match, which chooses the load mode. */
function ruleStage(context: Context, facts: Facts): IntentStage[] {
  const { standard } = context;
  const rules = standard.value.load?.when ?? [];
  const index = rules.findIndex((rule) => matches(rule, facts));
  const rule = rules[index];
  if (!rule) return [];
  return [
    {
      origin: "rule",
      intent: { load: { mode: rule.use } },
      at: () => ({ document: standard, pointer: `/load/when/${index}/use` }),
    },
  ];
}

/** `FIXED_SETTING` at each value of a flow, a flow table or a transform that differs from `fixed`. */
function checkFixed(context: Context, stages: IntentStage[]): void {
  const fixed = stages.find((stage) => stage.origin === "fixed");
  if (!fixed) return;
  // A deploy-time value differs from any fixed value (specification section 1.1).
  const unknown = (value: unknown) =>
    !context.deployTime && holdsUnsetEnvvar(context.project, value);
  for (const stage of stages.filter(
    (item) => item.origin === "definition" || item.origin === "table",
  ))
    for (const change of changedFixed(
      fixed.intent as Record<string, unknown>,
      stage.intent as Record<string, unknown>,
      [],
      unknown,
    ))
      reportFixed(context, change, stage.at(change.path.join(".")));
}

/** A flow table's declared intent. */
export function flowIntent(
  context: Context,
  flow: DefinitionDocument<FlowDoc>,
  tableName: string,
  facts: Facts,
): DeclaredIntent {
  return declaredIntent(context, {
    kind: "Flow",
    layer: facts.layer,
    document: flow,
    tableName,
    facts,
  });
}

/** A transform's declared intent. */
export function transformIntent(
  context: Context,
  document: DefinitionDocument<TransformDoc>,
  layer: string,
): DeclaredIntent {
  return declaredIntent(context, { kind: "Transform", layer, document, facts: { layer } });
}
