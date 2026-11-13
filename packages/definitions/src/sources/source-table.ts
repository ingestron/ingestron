// What listing the source tables gives for one flow table (specification section 12.7).
import type { SourceTableDoc } from "../documents/index.js";

/**
 * One flow table, with the entry its connection's source metadata has for it, for a tool that
 * imports metadata or drafts a contract and matches nothing itself. Listed for every flow
 * table, whether or not it resolved.
 * @public
 */
export interface SourceTable {
  /** The flow's id. */
  flow: string;
  /** The table's key in the flow. */
  table: string;
  /** The flow's `source`. */
  connection: string;
  /** The table's `object`, resolved for the environment; an unset reference is written as it is. */
  object: string;
  /** The id of the contract the table names. */
  contract?: string;
  /**
   * Why the table needs a contract (the reason of `CONTRACT_NEEDED`), whether or not it names
   * one.
   */
  needs?: string;
  /**
   * The one table of the connection's metadata the `object` matches; none for no match or more
   * than one.
   */
  entry?: SourceTableDoc;
  /** The `names` of the connection's metadata document, when it has one. */
  names?: { parts: number; caseSensitive: boolean };
  /** The file of the connection's metadata document, when it has one. */
  file?: string;
}
