// What a table's layer says about the actions of its checks (specification sections 6 and
// 11.2): the standard's `quality.required` and `quality.default`, over which the layer's apply.
import type { Context } from "../context/index.js";
import type { LayerDoc } from "../intent/index.js";
import type { Contract } from "../pack/index.js";
import { tableCheckAction } from "./quality-rules.js";

/** The action for a check. */
type Action = "warn" | "drop" | "fail";

/** The standard's object for the layer and its place in `layers`; undefined for a layer written as a name. */
export function layerObject(
  context: Context,
  name: string | undefined,
): { layer: LayerDoc; index: number } | undefined {
  const layers = context.standard.value.layers ?? [];
  const index = layers.findIndex((item) => (typeof item === "string" ? item : item.name) === name);
  const layer = layers[index];
  return layer === undefined || typeof layer === "string" ? undefined : { layer, index };
}

/**
 * The actions of a table's checks in its layer: the pack's defaults, over which the standard's
 * `quality` applies, over which the layer's does. A table's own expectation `action` wins over
 * all of them.
 */
export function qualityActions(
  context: Context,
  layer: string | undefined,
): { required: Action; default: Action } {
  const quality = { ...context.pack.defaults.quality, ...context.standard.value.quality };
  const own = layerObject(context, layer)?.layer.quality;
  return {
    required: own?.required ?? quality.required,
    default: own?.default ?? quality.default,
  };
}

/**
 * Gives the contract's table checks the layer's `quality.default` when the layer writes one: a
 * check fails when it is `fail`, and otherwise warns, as the standard's decides them. The
 * contract's checks change in place.
 */
export function layerTableChecks(context: Context, layer: string, contract: Contract): void {
  const action = layerObject(context, layer)?.layer.quality?.default;
  if (action === undefined) return;
  contract.tableChecks = contract.tableChecks.map((check) => ({
    ...check,
    action: tableCheckAction(action),
  }));
}
