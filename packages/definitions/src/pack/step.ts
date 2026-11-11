// A step of a table: its method, its pack, its settings and where each came from, and how
// the method was chosen.
import type { NotApplied } from "../diagnostics/index.js";
import type { StepOutput } from "./pack.js";

/**
 * A step's chosen method, the pack it belongs to, and its final settings.
 * @public
 */
export interface Step {
  method: string;
  pack: string;
  settings: Record<string, unknown>;
  /** For each top-level setting, the layer that last set it (specification section 3). */
  origins: Record<string, Origin>;
  /** How the method was chosen (specification section 4). */
  chosenBy: ChosenBy;
  /** Where the step's data lands, when its method says (specification section 2). */
  output?: StepOutput;
  /**
   * On a serve step of another pack than the keeping step's, or of a table no step keeps: the
   * access it does not apply (specification section 8.2). Absent when it has none.
   */
  notApplied?: NotApplied[];
}

/**
 * How a step's method was chosen, and where that was written.
 * @public
 */
export interface ChosenBy {
  by:
    "definition" | "standard-rule" | "standard-default" | "pack-rule" | "pack-default" | "runs-on";
  /** A rule's facts, such as `{ connectivity: private }`. */
  when?: Record<string, unknown>;
  /** The pack whose rule or default chose it, or that runs-on names. */
  pack?: string;
  /** Under runs-on, the method of another pack that this one replaced. */
  replaced?: string;
  file?: string;
  line?: number;
}

/**
 * Where a setting's value came from.
 * @public
 */
export interface Origin {
  layer: "pack" | "standard" | "platform" | "layer" | "rule" | "definition" | "table" | "fixed";
  /** Where it was written; absent for the pack's defaults. */
  file?: string;
  line?: number;
  /**
   * On an entry of a table's `intentOrigins`, the method setting the value was read from,
   * when it came from an aliased setting; absent for intent written as intent and for a
   * pack's defaults.
   */
  alias?: string;
}
