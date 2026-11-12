// The contract of a flow table that names none: its columns and key from its entry in the
// connection's source metadata (specification section 12.4).
import type { Context } from "../context/index.js";
import type { SourceColumnDoc, SourceTableDoc } from "../documents/index.js";
import type { Column, Contract } from "../pack/index.js";

/**
 * The model contract of a metadata table, which says it is one with `origin: "metadata"`.
 * Metadata is an observation and never a promise: every column is nullable, whatever
 * `required` says, and the contract has no checks, description, tags, roles or service
 * levels. A column's type is the one the packs' `types` give for its logical type, none when
 * they give none; a record or a list is one column, its fields kept in the metadata.
 */
export function metadataContract(
  context: Context,
  connection: string,
  table: SourceTableDoc,
): Contract {
  const types = { ...context.pack.defaults.types, ...context.standard.value.types };
  return {
    id: `${connection}:${table.object}`,
    origin: "metadata",
    columns: table.columns.map((column) => columnOf(column, types)),
    primaryKey: primaryKeyOf(table.columns),
    checks: [],
    tableChecks: [],
    unchecked: [],
    tags: [],
    roles: [],
    sla: [],
  };
}

function columnOf(column: SourceColumnDoc, types: Record<string, string>): Column {
  const type = types[column.logicalType];
  return {
    name: column.name,
    ...(type && { type }),
    logicalType: column.logicalType,
    nullable: true,
  };
}

/** The columns that have a `primaryKeyPosition`, ordered by it. */
function primaryKeyOf(columns: SourceColumnDoc[]): string[] {
  return columns
    .filter((column) => column.primaryKeyPosition !== undefined)
    .sort((a, b) => a.primaryKeyPosition! - b.primaryKeyPosition!)
    .map((column) => column.name);
}

/**
 * How a message names the place a table's columns are written: the contract, or for a table
 * whose contract is made from source metadata (`origin: "metadata"`), the entry's object in that
 * metadata, since the contract's id is not one a person wrote (specification section 9). `name`
 * follows "a column of" and "is <type> in" alike, and `lists` is what lists the columns.
 */
export function columnsPlace(contract: Contract): { name: string; lists: string } {
  if (contract.origin !== "metadata")
    return { name: `contract "${contract.id}"`, lists: "contract" };
  return { name: `"${metadataObject(contract)}" in the source metadata`, lists: "source metadata" };
}

/** The `object` of the metadata entry a contract with `origin: "metadata"` was made from. */
export function metadataObject(contract: Contract): string {
  return contract.id.slice(contract.id.indexOf(":") + 1);
}
