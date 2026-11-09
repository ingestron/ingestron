// The chosen methods' intent defaults (specification section 11.3, ruling on which
// step's default a path takes when several give one).
import { merge } from "../internal/index.js";
import type { Intent } from "../intent/index.js";
import type { Method } from "../pack/index.js";
import type { MergedIntent } from "./intent-stages.js";
import { intentAt, leaves, valueAtIntentPath } from "./intent-values.js";
import type { StepResult } from "./steps.js";

/** A table's step and the method chosen for it. */
export interface ChosenStep {
  step: StepResult;
  method: Method;
}

/** Paths the ingest step judges; the store step judges those in `storeJudges`. */
const ingestJudges = (path: string) =>
  path.startsWith("load.") || path === "retention.landed_files";
const storeJudges = (path: string) =>
  ["history", "sequence", "rescued", "retention.time_travel", "retention.log"].includes(path) ||
  path.startsWith("storage.");

/**
 * Fills every intent path still unset from the chosen methods' `intentDefaults`, with the
 * origin `pack`. When several steps give one, the step that judges the path gives it.
 */
export function fillDefaults(completed: MergedIntent, chosen: ChosenStep[]): void {
  const paths = new Set(chosen.flatMap(({ method }) => leaves(method.intentDefaults ?? {})));
  for (const path of paths) {
    if (valueAtIntentPath(completed.intent, path) !== undefined) continue;
    const giving = chosen.filter(({ method }) => defaultAt(method, path) !== undefined);
    const from = judgeOf(path, giving) ?? giving.at(-1);
    if (!from) continue;
    completed.intent = merge(
      completed.intent as Record<string, unknown>,
      intentAt(path, defaultAt(from.method, path)) as Record<string, unknown>,
    ) as Intent;
    completed.origins[path] = { layer: "pack" };
  }
}

function defaultAt(method: Method, path: string): unknown {
  return valueAtIntentPath(method.intentDefaults ?? {}, path);
}

/**
 * The step that judges the path, among those giving a default: the ingest step for
 * `load` and landed files; the store step for what is kept, else an ingest step that
 * writes the table. Other paths have none here, so the later step gives them.
 */
function judgeOf(path: string, giving: ChosenStep[]): ChosenStep | undefined {
  const acting = (action: string) => giving.find(({ method }) => method.action === action);
  if (ingestJudges(path)) return acting("ingest");
  if (!storeJudges(path)) return undefined;
  return (
    acting("store") ??
    giving.find(({ method, step }) => method.action === "ingest" && step.produces === "table")
  );
}
