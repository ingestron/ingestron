// The facts of a table that `when` rules can match.
import type { Handover } from "../pack/index.js";
import type { History, LoadMode } from "../intent/index.js";

/** Facts that `when` rules can match. */
export interface Facts {
  connectivity?: string;
  connector?: string;
  input?: Handover;
  layer: string;
  /** The load mode and history the table declares as intent; the pack's defaults are not facts. */
  load?: LoadMode;
  history?: History;
  /** The highest classification of the contract's columns, by the standard's order, among the columns of the contract object the table uses. */
  classification?: string;
  /** The tags of the contract object the table uses. */
  tags?: string[];
  /** The data product that publishes the contract, and its domain. */
  product?: string;
  domain?: string;
}
