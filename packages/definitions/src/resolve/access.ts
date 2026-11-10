// Who may use each table, and which of its columns and rows are hidden (specification
// section 8.2): grants from the contract's and the layer's roles, masks by classification
// and row filters by tag or classification. Resolved once, so every pack applies the same
// answer; whether a pack applies it is judged elsewhere.
import type { Context } from "../context/index.js";
import { contractEntryAt, layerObject } from "../contracts/index.js";
import { kinds, type FilterMatch, type GovernanceDoc } from "../documents/index.js";
import type {
  AccessGrant,
  Column,
  ColumnMask,
  ContractRole,
  ResolvedTable,
  RowFilter,
} from "../pack/index.js";
import { isNotText } from "./cleanse-fit.js";

/** The tag key a classification is set as when the standard names none. */
const defaultTag = "classification";
/** The masks a pack writes itself; any other name is a function the team owns. */
const builtInMasks = new Set(["null", "hash", "redact"]);
/** The built-in masks that work only on text. */
const textMasks = new Set(["hash", "redact"]);
/** What each contract access grants; `write` comes with `read`. */
const privilegesOf: Record<string, AccessGrant["privileges"]> = {
  read: ["read"],
  write: ["read", "write"],
};

/** The standard's governance with `classification.tag` filled in; undefined without one. */
export function governanceOf(context: Context): GovernanceDoc | undefined {
  const governance = context.standard.value.governance;
  if (!governance) return undefined;
  return { ...governance, classification: { ...governance.classification, tag: tagOf(context) } };
}

function tagOf(context: Context): string {
  return context.standard.value.governance?.classification?.tag ?? defaultTag;
}

/**
 * Gives each table that does not end at the landed files its access, when it has any
 * grant, mask or filter, and reports each role, mask and filter that cannot be resolved.
 */
export function resolveAccess(context: Context, tables: ResolvedTable[]): void {
  checkRoleAccess(context, tables);
  const exact = context.standard.value.governance?.access?.grants === "exact";
  for (const table of tables) {
    if (table.endsAtFiles) continue;
    const grants = grantsOf(context, table);
    const masks = masksOf(context, table);
    const filters = filtersOf(context, table);
    if (grants.length + masks.length + filters.length > 0)
      table.access = { grants, exact, masks, filters };
  }
}

/** `ROLE_ACCESS` at each role whose access is neither read nor write, once per contract. */
function checkRoleAccess(context: Context, tables: ResolvedTable[]): void {
  for (const id of new Set(tables.map((table) => table.contract.id))) {
    const document = context.project.get(kinds.contract, id);
    if (!document) continue;
    (document.value.roles ?? []).forEach((role, index) => {
      if (role.access === undefined || Object.hasOwn(privilegesOf, role.access)) return;
      context.reporter.error(
        "ROLE_ACCESS",
        `The role "${role.role}" of contract "${id}" has access "${role.access}"; it must be read or write.`,
        { document, pointer: `/roles/${index}/access` },
        "Write read, or write for read and write. Leave it out to read.",
      );
    });
  }
}

/** The contract's roles, unless the layer turns them off, then the layer's own. */
function grantsOf(context: Context, table: ResolvedTable): AccessGrant[] {
  const principals = context.platform?.value.principals ?? {};
  const layer = layerObject(context, table.layer)?.layer.access;
  const grant = (role: ContractRole, from: AccessGrant["from"]): AccessGrant[] => {
    const access = role.access ?? "read";
    if (!Object.hasOwn(privilegesOf, access)) return [];
    const principal = Object.hasOwn(principals, role.role) ? principals[role.role]! : role.role;
    return [{ role: role.role, principal, privileges: [...privilegesOf[access]!], from }];
  };
  const contract = layer?.contract === false ? [] : table.contract.roles;
  return [
    ...contract.flatMap((role) => grant(role, "contract")),
    ...(layer?.roles ?? []).flatMap((role) => grant(role, "layer")),
  ];
}

/** Each column whose classification the standard masks, in the contract's order. */
function masksOf(context: Context, table: ResolvedTable): ColumnMask[] {
  const masks = context.standard.value.governance?.masks ?? {};
  return table.contract.columns.flatMap((column, index) => {
    const classification = column.classification;
    if (classification === undefined || !Object.hasOwn(masks, classification)) return [];
    const mask = masks[classification]!;
    if (textMasks.has(mask) && isNotText(column)) {
      reportMaskType(context, table, { column, index, mask });
      return [];
    }
    const kind = builtInMasks.has(mask) ? (mask as "null" | "hash" | "redact") : { function: mask };
    return [{ column: column.name, classification, mask: kind }];
  });
}

function reportMaskType(
  context: Context,
  table: ResolvedTable,
  { column, index, mask }: { column: Column; index: number; mask: string },
): void {
  const entry = contractEntryAt(table.contract);
  const at = entry && { ...entry, pointer: `${entry.pointer}/properties/${index}/classification` };
  context.reporter.error(
    "MASK_TYPE",
    `The mask "${mask}" for "${column.classification}" works on text, and "${column.name}" is ${column.logicalType} in contract "${table.contract.id}".`,
    at,
    `Mask "${column.classification}" with "null" or a function of your own, or classify "${column.name}" differently.`,
  );
}

/** Each filter whose match names one column of the table, in the standard's order. */
function filtersOf(context: Context, table: ResolvedTable): RowFilter[] {
  const filters = context.standard.value.governance?.filters ?? {};
  const tag = tagOf(context);
  return Object.entries(filters).flatMap(([name, filter]) => {
    const columns = table.contract.columns
      .filter((column) => matches(filter.match, column, tag))
      .map((column) => column.name);
    if (columns.length <= 1)
      return columns.map((column) => ({ name, column, function: filter.function }));
    context.reporter.error(
      "FILTER_MATCH",
      `The filter "${name}" matches ${columns.length} columns of contract "${table.contract.id}": ${columns.join(", ")}. A filter matches one column of each table.`,
      { document: context.standard, pointer: `/governance/filters/${name}` },
      "Narrow its match, such as with a tag value, or tag only one of the columns.",
    );
    return [];
  });
}

/** True when the column has the classification, or a tag of the key (and value), the match names. */
function matches(match: FilterMatch, column: Column, tag: string): boolean {
  if ("classification" in match) return column.classification === match.classification;
  return tagsOf(column, tag).some(
    ([key, value]) => key === match.tag && (match.value === undefined || value === match.value),
  );
}

/**
 * The tags a platform sets on the column, as key and value: its contract tags, `key` or
 * `key:value`, and its classification under the standard's tag key.
 */
function tagsOf(column: Column, tag: string): [string, string][] {
  const written = (column.tags ?? []).map((text): [string, string] => {
    const at = text.indexOf(":");
    return at < 0 ? [text, ""] : [text.slice(0, at), text.slice(at + 1)];
  });
  return column.classification === undefined ? written : [...written, [tag, column.classification]];
}
