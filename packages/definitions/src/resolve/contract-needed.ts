// When a flow table that names no contract needs one (specification section 12.5).
import { layerObject } from "../contracts/index.js";
import { isOn } from "../context/index.js";
import type { Context } from "../context/index.js";
import type { LayerDuty } from "../intent/index.js";
import { doesOf, listsDuty } from "./layer-duties.js";
import type { FlowSteps } from "./flow-sources.js";

/** The duties that need a contract, in the order the reason names them. */
const duties: LayerDuty[] = ["cleanse", "check", "quarantine"];

/** What the rule reads of a table: where it is kept and its own expectations. */
export interface ContractNeedTable {
  /** The table's layer. */
  layer: string;
  /** The table's steps, as far as they are known. */
  steps: Partial<FlowSteps> | undefined;
  /** True when the flow table lists `expectations` of its own. */
  expectations: boolean;
}

/**
 * The reason a table without a contract needs one, for the environment being planned, else
 * undefined (specification section 12.5): the first that holds of its layer's duty, access
 * managed for it, and its own expectations. A data product's port finds its table by a
 * contract, so that trigger has no rule here.
 */
export function contractNeeded(context: Context, table: ContractNeedTable): string | undefined {
  const { layer } = table;
  const duty = duties.find((item) => listsDuty(doesOf(context, layer), item));
  if (duty !== undefined) return `its layer ${layer} does ${duty}`;
  const pack = accessPack(table);
  if (pack !== undefined && accessManaged(context, layer, pack))
    return `access is managed for it on ${pack}`;
  return table.expectations ? "it has its own expectations" : undefined;
}

/**
 * The pack that access is resolved on for the table: the one that keeps it, or, for a table
 * that ends at the landed files, the serve step's. Undefined when the steps are not known
 * or no pack applies access.
 */
function accessPack({ steps }: ContractNeedTable): string | undefined {
  if (steps?.endsAtFiles !== undefined) return steps.serve?.pack;
  if (steps?.store) return steps.store.pack;
  return steps?.ingest?.produces === "table" ? steps.ingest.pack : undefined;
}

/** True when the layer lets the contract govern access and the platform manages grants or masks. */
function accessManaged(context: Context, layer: string, pack: string): boolean {
  if (layerObject(context, layer)?.layer.access?.contract === false) return false;
  return isOn(context, "grants", pack) || isOn(context, "masks", pack);
}
