// The facts of a table that come from its declared intent and its governance, which rules match
// (specification section 4).
import type { Context } from "../context/index.js";
import { contractEntry } from "../contracts/index.js";
import type { Intent } from "../intent/index.js";
import { productDocuments } from "../platform/index.js";
import type { Facts } from "./facts.js";

/** The facts a table's contract and its data product give. */
export type GovernanceFacts = Pick<Facts, "classification" | "tags" | "product" | "domain">;

/**
 * The governance facts of a table: the highest classification of the columns of the
 * contract object the table uses (by the order of the standard's
 * `governance.classification.values`; none without that list), that object's tags, and
 * the id and domain of the first data product, in path order, that publishes the contract.
 * A table with no contract (its columns come from source metadata) has no tags and nothing
 * else.
 */
export function tableFacts(
  context: Context,
  contractId: string | undefined,
  table: string,
): GovernanceFacts {
  if (contractId === undefined) return { tags: [] };
  const entry = contractEntry(context, contractId, table);
  const classification = highest(
    context.standard.value.governance?.classification?.values ?? [],
    (entry?.properties ?? []).map((column) => column.classification),
  );
  const tags = (entry?.tags ?? []).map(String);
  return {
    ...(classification !== undefined && { classification }),
    tags,
    ...publisher(context, contractId),
  };
}

/** The id and domain of the first data product that publishes the contract. */
function publisher(context: Context, contractId: string): Pick<Facts, "product" | "domain"> {
  const product = productDocuments(context).find((document) =>
    (document.value.outputPorts ?? []).some((port) => port.contractId === contractId),
  )?.value;
  return {
    ...(product && { product: product.id }),
    ...(product?.domain !== undefined && { domain: product.domain }),
  };
}

/** The classification latest in `order`; one `order` does not list does not count. */
function highest(order: string[], found: (string | undefined)[]): string | undefined {
  const rank = (value: string | undefined) => (value === undefined ? -1 : order.indexOf(value));
  return found.reduce<string | undefined>(
    (top, value) => (rank(value) > rank(top) ? value : top),
    undefined,
  );
}

/**
 * The intent facts of a table: the load mode and history it declares. Only what is
 * declared counts; the pack's defaults, which come after methods are chosen, are not facts.
 */
export function intentFacts(intent: Intent): Pick<Facts, "load" | "history"> {
  return {
    ...(intent.load?.mode !== undefined && { load: intent.load.mode }),
    ...(intent.history !== undefined && { history: intent.history }),
  };
}
