// The stages a table's intent is merged from (specification sections 11.2 and 11.4):
// each layer's say, merged in order of precedence, later winning.
import type { Source } from "../diagnostics/index.js";
import { merge } from "../internal/index.js";
import type { Intent } from "../intent/index.js";
import type { Origin } from "../pack/index.js";
import { leaves } from "./intent-values.js";

/** One layer's say: its intent, and where each value was written. */
export interface IntentStage {
  origin: Exclude<Origin["layer"], "pack">;
  intent: Intent;
  /** The method setting the intent was read from, when it came from an aliased setting. */
  alias?: string;
  /** Where the value at an intent path was written. */
  at: (path: string) => Source;
}

/** The positions of the precedence (section 11.2), earliest first. */
const positions: Origin["layer"][] = ["standard", "layer", "rule", "definition", "table", "fixed"];

/**
 * A layer's position in the precedence, later winning: the platform's settings take the
 * standard's, and a pack's default comes before all.
 */
export function positionOf(layer: Origin["layer"]): number {
  return positions.indexOf(layer === "platform" ? "standard" : layer);
}

/** A table's intent, the origin of each value and where it was written, keyed by intent path. */
export interface MergedIntent {
  intent: Intent;
  origins: Record<string, Origin>;
  sources: Record<string, Source>;
}

/** The stages' intent merged in the order given, later winning, mappings key by key. */
export function mergeStages(stages: readonly IntentStage[]): MergedIntent {
  const intent = stages.reduce<Record<string, unknown>>(
    (result, stage) => merge(result, stage.intent as Record<string, unknown>),
    {},
  ) as Intent;
  const origins: Record<string, Origin> = {};
  const sources: Record<string, Source> = {};
  for (const stage of stages)
    for (const path of leaves(stage.intent)) {
      const at = stage.at(path);
      const location = at.document.locate(at.pointer);
      origins[path] = {
        layer: stage.origin,
        file: location.file,
        line: location.line,
        ...(stage.alias !== undefined && { alias: stage.alias }),
      };
      sources[path] = at;
    }
  return { intent, origins, sources };
}
