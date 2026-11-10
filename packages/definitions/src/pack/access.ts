// A table's access in the resolved model (specification section 8.2): who may use the
// table, and which of its columns and rows are hidden, before any pack judges it.
import type { ResolvedModel } from "./model.js";

/**
 * The tag key a column's classification is set as on the platform when the standard's
 * `governance.classification.tag` gives none (specification section 8.1).
 * @public
 */
export const defaultClassificationTag = "classification";

/**
 * The tag key a column's classification is set as on the platform: the standard's
 * `governance.classification.tag`, else {@link defaultClassificationTag}.
 * @example const key = classificationTag(model); // "classification" unless the standard says
 * @public
 */
export function classificationTag(model: Pick<ResolvedModel, "standard">): string {
  return model.standard.governance?.classification?.tag ?? defaultClassificationTag;
}

/**
 * A table's access, as the contracts, the standard and the Platform declare it
 * (specification section 8.2). Whether a pack applies it is judged separately.
 * @public
 */
export interface TableAccess {
  /** The contract's roles, unless the layer turns them off, then the layer's roles. */
  grants: AccessGrant[];
  /** True when grants also take away what they do not name (`governance.access.grants: exact`). */
  exact: boolean;
  /** Each masked column, in the contract's order. */
  masks: ColumnMask[];
  /** Each row filter that matches one column of the table, in the standard's order. */
  filters: RowFilter[];
}

/**
 * One role granted on a table. Privileges are engine-neutral: `write` comes with `read`.
 * @example { role: "marketing-analysts", principal: "mkt-prod", privileges: ["read"], from: "contract" }
 * @public
 */
export interface AccessGrant {
  /** The role as the contract or the layer names it. */
  role: string;
  /** The Platform's `principals` entry for the role, else the role itself. */
  principal: string;
  /** `["read"]`, or `["read", "write"]` for write access. */
  privileges: ("read" | "write")[];
  /** Whether the contract's roles or the layer's `access.roles` name it. */
  from: "contract" | "layer";
}

/**
 * A column masked by its classification. A function's name is kept as written: a one-part
 * name is placed by the pack.
 * @example { column: "email", classification: "confidential", mask: "hash" }
 * @public
 */
export interface ColumnMask {
  /** The column's name in the contract. */
  column: string;
  /** The column's classification, which the standard's `governance.masks` names. */
  classification: string;
  /** A built-in mask, or a function the team owns, its name as written. */
  mask: "null" | "hash" | "redact" | { function: string };
}

/**
 * A row filter on a table: the function, as written, is given the one column its match names.
 * @example { name: "region_rows", column: "country", function: "region_filter" }
 * @public
 */
export interface RowFilter {
  /** The filter's name in the standard's `governance.filters`. */
  name: string;
  /** The column the function is given. */
  column: string;
  /** The BOOLEAN function the team owns, its name as written. */
  function: string;
}
