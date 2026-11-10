// Where a contract's checks, and a table's expectations and their actions, were written,
// so the step that keeps the table can judge them where they are written (specification
// section 11.7).
import type { Context } from "../context/index.js";
import type { Source } from "../diagnostics/index.js";
import type { ExpectationDoc } from "../documents/index.js";
import type { Contract } from "../pack/index.js";
import { layerObject } from "./layer-quality.js";

/** Where a contract's checks were written. */
interface ContractPlaces {
  /** The schema entry the table uses. */
  entry: Source;
  /** Where each of `checks` was written, in the same order. */
  checks: Source[];
  /** Where each of `tableChecks` was written, in the same order. */
  tableChecks: Source[];
}

const contractPlaces = new WeakMap<Contract, ContractPlaces>();

/** Records where the contract's checks were written, for `expectationPlaces`. */
export function rememberPlaces(contract: Contract, places: ContractPlaces): void {
  contractPlaces.set(contract, places);
}

/** Where an expectation's rule and its action were written; either may be unknown. */
export interface ExpectationPlace {
  rule?: Source;
  action?: Source;
}

/**
 * Where each expectation `expectationsFor` makes was written, in its order: a required
 * column's `required`, a check's rule or option, a definition's own expectation; and its
 * action: the definition's own `action`, else the `quality.required` or `quality.default` of the
 * table's `layer`, else the standard's, unknown when the pack's default gives it. `ownAt` is
 * the definition's `expectations` list.
 */
export function expectationPlaces(
  context: Context,
  contract: Contract,
  own: ExpectationDoc[] = [],
  ownAt?: Source,
  layer?: string,
): ExpectationPlace[] {
  const places = contractPlaces.get(contract);
  const entry = places?.entry;
  const required = contract.columns.flatMap((column, index) =>
    column.nullable
      ? []
      : [
          {
            ...(entry && {
              rule: { ...entry, pointer: `${entry.pointer}/properties/${index}/required` },
            }),
            ...withAction(actionPlace(context, layer, "required")),
          },
        ],
  );
  const rules = contract.checks.map((_, index) => ({
    ...(places?.checks[index] && { rule: places.checks[index] }),
    ...withAction(actionPlace(context, layer, "default")),
  }));
  const written = own.map((expectation, index) => {
    const at = ownAt && { ...ownAt, pointer: `${ownAt.pointer}/${index}` };
    const action =
      expectation.action !== undefined
        ? at && { ...at, pointer: `${at.pointer}/action` }
        : actionPlace(context, layer, "default");
    return { ...(at && { rule: at }), ...withAction(action) };
  });
  return [...required, ...rules, ...written];
}

/** Where each of the contract's table checks was written, in its order. */
export function tableCheckPlaces(contract: Contract): (Source | undefined)[] {
  const places = contractPlaces.get(contract)?.tableChecks ?? [];
  return contract.tableChecks.map((_, index) => places[index]);
}

/** The standard's `quality.<key>` when it writes one; undefined when the pack's default gives it. */
export function standardQualityAt(
  context: Context,
  key: "required" | "default",
): Source | undefined {
  return context.standard.value.quality?.[key] === undefined
    ? undefined
    : { document: context.standard, pointer: `/quality/${key}` };
}

/**
 * Where the table's `layer` writes its `quality.<key>`, else where the standard does; undefined
 * when the pack's default gives it.
 */
export function actionPlace(
  context: Context,
  layer: string | undefined,
  key: "required" | "default",
): Source | undefined {
  const found = layerObject(context, layer);
  if (found?.layer.quality?.[key] !== undefined)
    return { document: context.standard, pointer: `/layers/${found.index}/quality/${key}` };
  return standardQualityAt(context, key);
}

function withAction(action: Source | undefined): { action?: Source } {
  return action ? { action } : {};
}
