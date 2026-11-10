// What a table's layer does (specification section 5): the table's `does`, the actions of
// its checks in a layer that does not check, and `LAYER_RESPONSIBILITY` for a setting that
// asks for a duty the layer leaves out.
import type { Context } from "../context/index.js";
import type { Source } from "../diagnostics/index.js";
import type { ExpectationDoc } from "../documents/index.js";
import type { LayerDuty } from "../intent/index.js";
import { expectationsFor, layerTableChecks } from "../contracts/index.js";
import type { Contract, Expectation, ResolvedTable } from "../pack/index.js";

/** The `does` of the standard's layer of that name; undefined when the layer gives none. */
export function doesOf(context: Context, layer: string): ResolvedTable["does"] {
  for (const item of context.standard.value.layers ?? [])
    if (typeof item !== "string" && item.name === layer) return item.does;
  return undefined;
}

/**
 * The table's `expectations`, with the contract's, the standard's and its layer's and its own
 * actions as its layer allows, and its `does` when the layer gives one.
 */
export function checksIn(
  context: Context,
  layer: string,
  contract: Contract,
  own: ExpectationDoc[] | undefined,
): Pick<ResolvedTable, "expectations" | "does"> {
  const layerDoes = doesOf(context, layer);
  layerTableChecks(context, layer, contract);
  const expectations = actionsFor(
    layerDoes,
    contract,
    expectationsFor(context, contract, own, layer),
  );
  // The table's own copy of a list, so nothing that reads the table can change the standard.
  const does = Array.isArray(layerDoes) ? [...layerDoes] : layerDoes;
  return { expectations, ...(does !== undefined && { does }) };
}

/** True when the layer lists the duty; a `raw` layer, and one that gives no `does`, list none. */
export function listsDuty(layer: ResolvedTable["does"], duty: LayerDuty): boolean {
  return Array.isArray(layer) && layer.includes(duty);
}

/**
 * The table's checks as its layer allows. In a layer that gives `does` without `check`, every
 * action is `warn`: rows are kept and failed checks only count. A layer that gives none, or
 * that checks, leaves them as they are. The contract's table checks change in place.
 */
function actionsFor(
  layer: ResolvedTable["does"],
  contract: Contract,
  expectations: Expectation[],
): Expectation[] {
  if (layer === undefined || listsDuty(layer, "check")) return expectations;
  contract.tableChecks = contract.tableChecks.map((check) => ({ ...check, action: "warn" }));
  return expectations.map((expectation) => ({ ...expectation, action: "warn" }));
}

/** The table's layer and what it does; the part of a table that duties are asked of. */
export type DutyTable = Pick<ResolvedTable, "layer" | "does">;

/**
 * Asks for a duty at a setting: true when the table's layer does it, or gives no `does`.
 * Otherwise `LAYER_RESPONSIBILITY` at the setting, whose hint names the layers that do it, and
 * false. `what` says what was written, such as `a "drop" action`.
 */
export function requireDuty(
  context: Context,
  table: DutyTable,
  duty: LayerDuty,
  what: string,
  at: Source,
): boolean {
  if (table.does === undefined || listsDuty(table.does, duty)) return true;
  context.reporter.error(
    "LAYER_RESPONSIBILITY",
    `The layer "${table.layer}" does not list ${duty} in its does, so ${what} cannot be set here.`,
    at,
    hintFor(context, duty),
  );
  return false;
}

/** The layers that do the duty, else how to make this one do it. */
function hintFor(context: Context, duty: LayerDuty): string {
  const layers = (context.standard.value.layers ?? []).flatMap((item) =>
    typeof item !== "string" && listsDuty(item.does, duty) ? [item.name] : [],
  );
  return layers.length > 0
    ? `Layers that do ${duty}: ${layers.join(", ")}. Or add \`${duty}\` to this layer's \`does\`.`
    : `Add \`${duty}\` to the layer's \`does\`.`;
}

/**
 * `LAYER_RESPONSIBILITY` at each action of the table's own expectations that is `drop` or
 * `fail` in a layer that does not check. A default is not written here, so is not an error.
 */
export function checkActionDuties(
  context: Context,
  table: DutyTable,
  own: { docs: ExpectationDoc[] | undefined; at: Source },
): void {
  (own.docs ?? []).forEach((expectation, index) => {
    const action = expectation.action;
    if (action !== "drop" && action !== "fail") return;
    const at = { ...own.at, pointer: `${own.at.pointer}/${index}/action` };
    requireDuty(context, table, "check", `a "${action}" action`, at);
  });
}
