// The resolved model: everything a pack needs, with every choice made,
// every name built and every setting merged. Packs only read it.

import type { TableCheck } from "./table-checks.js";

/** A step's chosen method, the pack it belongs to, and its final settings. */
export interface Step {
  method: string;
  pack: string;
  settings: Record<string, unknown>;
  /** For each top-level setting, the layer that last set it (specification section 3). */
  origins: Record<string, Origin>;
  /** How the method was chosen (specification section 4). */
  chosenBy: ChosenBy;
}

/** How a step's method was chosen, and where that was written. */
export interface ChosenBy {
  by: "definition" | "standard-rule" | "standard-default" | "pack-rule" | "pack-default";
  /** A rule's facts, such as `{ connectivity: private }`. */
  when?: Record<string, unknown>;
  /** The pack whose rule or default chose it. */
  pack?: string;
  file?: string;
  line?: number;
}

/** Where a setting's value came from. */
export interface Origin {
  layer: "pack" | "standard" | "platform" | "rule" | "definition" | "table" | "fixed";
  /** Where it was written; absent for the pack's defaults. */
  file?: string;
  line?: number;
}

/** A column from the table's contract, with its platform type. */
export interface Column {
  name: string;
  /** `physicalType` from the contract, else the standard's type for its `logicalType`, if any. */
  type?: string;
  logicalType?: string;
  /** The column's name at the source, when it differs; the table uses `name`. */
  physicalName?: string;
  /** The contract's tags for the column, such as `pii` or `domain:sales`. */
  tags?: string[];
  /** The contract's classification of the column, such as `restricted`. */
  classification?: string;
  nullable: boolean;
  description?: string;
}

/** The parts of an ODCS contract that generation uses. */
export interface Contract {
  id: string;
  description?: string;
  columns: Column[];
  /** Columns marked `primaryKey`, in `primaryKeyPosition` order. */
  primaryKey: string[];
  /** Row checks made from the contract's quality rules (specification section 6). */
  checks: { name: string; check: string }[];
  /** Checks over all rows, run after each refresh when checks are on. */
  tableChecks: TableCheck[];
  /** The contract object's tags. */
  tags: string[];
}

/** A row check; `action` decides what happens to a row that fails. */
export interface Expectation {
  name: string;
  check: string;
  action: "warn" | "drop" | "fail";
  /** `contract`: a required column; `definition`: written in the flow or transform. */
  from: "contract" | "definition";
}

/** Where a table's names point: `catalog.schema.table`. */
export interface FullName {
  catalog: string;
  schema: string;
  table: string;
}

/**
 * One table to build, from a flow or a transform. Tables come in dependency
 * order: every input before the tables that read it.
 * @example
 * `${table.fullName.catalog}.${table.fullName.schema}.${table.fullName.table}`
 */
export interface ResolvedTable {
  name: string;
  layer: string;
  fullName: FullName;
  origin: { kind: "Flow" | "Transform"; id: string; file: string };
  contract: Contract;
  expectations: Expectation[];
  /** Flow tables: how data leaves the source. */
  ingest?: Step & {
    connection: {
      id: string;
      connector: string;
      connectivity: string;
      settings: Record<string, unknown>;
    };
    object: string;
    /** True when the ingest method hands over columns under their contract names. */
    renamed: boolean;
  };
  /** Transforms: the code and the full name of each input. */
  transform?: Step & { code: string; inputs: Record<string, string> };
  /** How the data is kept. Absent when the ingest method already writes a table. */
  store?: Step;
  /** Set when the flow ends at the files ingest lands: how `store: none` was chosen. */
  endsAtFiles?: ChosenBy;
}

/** A schedule after defaults. */
export interface Schedule {
  cron: string;
  timezone: string;
  paused: boolean;
}

/** One permission on generated jobs and pipelines. */
export type Permission = { level: string } & Record<string, string>;

/** A grant on a generated schema. */
export interface Grant {
  principal: string;
  privileges: string[];
}

/** The Platform document after smart defaults. */
export interface ResolvedPlatform {
  mode: "development" | "production";
  workspace: { host?: string; root_path?: string };
  run_as?: Record<string, string>;
  compute: { serverless: boolean; budget_policy_id?: string; channel?: string };
  tags: Record<string, string>;
  permissions: Permission[];
  schedule?: Schedule;
  notifications: { on_failure: string[] };
  manage: { schemas: boolean; tags: boolean; comments: boolean; checks: boolean };
  grants: Record<string, Grant[]>;
}

/**
 * Everything resolved for one environment.
 * @example
 * for (const table of model.tables) console.log(table.fullName.table, table.store?.method);
 */
export interface ResolvedModel {
  project: { id: string; name?: string; environment: string };
  standard: { id: string; packs: string[] };
  platform: ResolvedPlatform;
  layers: string[];
  /** Names that are not per table. */
  names: { pipeline: string; job: string };
  tables: ResolvedTable[];
}
