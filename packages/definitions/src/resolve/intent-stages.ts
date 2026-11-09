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
  /** Where the value at an intent path was written. */
  at: (path: string) => Source;
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
      origins[path] = { layer: stage.origin, file: location.file, line: location.line };
      sources[path] = at;
    }
  return { intent, origins, sources };
}
