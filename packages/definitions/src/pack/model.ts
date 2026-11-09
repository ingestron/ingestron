// The resolved model: everything a pack needs, with every choice made,
// every name built and every setting merged. Packs only read it.

import type { GovernanceDoc } from "../documents/index.js";
import type { FeatureStatus, Intent, ResolvedOperations } from "../intent/index.js";
import type { StepOutput } from "./pack.js";
import type { TableCheck } from "./table-checks.js";

/**
 * A step's chosen method, the pack it belongs to, and its final settings.
 * @public
 */
export interface Step {
  method: string;
  pack: string;
  settings: Record<string, unknown>;
  /** For each top-level setting, the layer that last set it (specification section 3). */
  origins: Record<string, Origin>;
  /** How the method was chosen (specification section 4). */
  chosenBy: ChosenBy;
  /** Where the step's data lands, when its method says (specification section 2). */
  output?: StepOutput;
}

/**
 * How a step's method was chosen, and where that was written.
 * @public
 */
export interface ChosenBy {
  by:
    "definition" | "standard-rule" | "standard-default" | "pack-rule" | "pack-default" | "runs-on";
  /** A rule's facts, such as `{ connectivity: private }`. */
  when?: Record<string, unknown>;
  /** The pack whose rule or default chose it, or that runs-on names. */
  pack?: string;
  /** Under runs-on, the method of another pack that this one replaced. */
  replaced?: string;
  file?: string;
  line?: number;
}

/**
 * Where a setting's value came from.
 * @public
 */
export interface Origin {
  layer: "pack" | "standard" | "platform" | "layer" | "rule" | "definition" | "table" | "fixed";
  /** Where it was written; absent for the pack's defaults. */
  file?: string;
  line?: number;
}

/**
 * A column from the table's contract, with its platform type.
 * @public
 */
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

/**
 * The parts of an ODCS contract that generation uses.
 * @public
 */
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
  /** Quality rules nothing checks, and why; text rules among them. */
  unchecked: { name: string; description?: string; reason: string }[];
  /** The contract object's tags. */
  tags: string[];
  /** Who may use the data, as the contract declares it (ODCS `roles`). */
  roles: ContractRole[];
  /** The contract's promises, such as freshness (ODCS `slaProperties`), values as text. */
  sla: { property: string; value: string; unit?: string }[];
}

/**
 * One ODCS role: a group, its access, its purpose and who approves it.
 * @public
 */
export interface ContractRole {
  role: string;
  access?: string;
  description?: string;
  firstLevelApprovers?: string;
}

/**
 * A row check; `action` decides what happens to a row that fails.
 * @public
 */
export interface Expectation {
  name: string;
  check: string;
  action: "warn" | "drop" | "fail";
  /** `contract`: a required column; `definition`: written in the flow or transform. */
  from: "contract" | "definition";
}

/**
 * Where a table's names point: `catalog.schema.table`.
 * @public
 */
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
 * @public
 */
export interface ResolvedTable {
  name: string;
  layer: string;
  fullName: FullName;
  origin: { kind: "Flow" | "Transform"; id: string; file: string };
  contract: Contract;
  expectations: Expectation[];
  /**
   * What the standard, the table's layer, its flow or transform and the table itself say
   * about how it is loaded, kept and audited, with the method settings that are other names
   * for intent, completed by the chosen methods' intent defaults (specification sections
   * 11.2 to 11.4). `{}` when nothing is declared and no method gives a default.
   */
  intent: Intent;
  /**
   * For each intent path in `intent`, such as `load.mode` or `audit`, the layer that last
   * set it and where it was written; `pack`, with no file, for a method's intent default.
   */
  intentOrigins: Record<string, Origin>;
  /** Flow tables: how data leaves the source. Missing when `sourceNotKnown` is set and no `uses` names the method. */
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
  /** Makes the table's data available elsewhere, after its last step. Absent unless chosen. */
  serve?: Step;
  /**
   * A flow table's `source` when it holds an unset `${envvar:…}`, which only an editor's
   * resolution allows (specification section 1). The connection is then a stand-in with no
   * settings, and unless the flow names its ingest method with `uses`, the table has no
   * steps. Files are never generated from such a table.
   */
  sourceNotKnown?: string;
}

/**
 * A schedule after defaults.
 * @public
 */
export interface Schedule {
  cron: string;
  timezone: string;
  paused: boolean;
}

/**
 * One permission on generated jobs and pipelines.
 * @public
 */
export type Permission = { level: string } & Record<string, string>;

/**
 * A grant on a generated schema.
 * @public
 */
export interface Grant {
  principal: string;
  privileges: string[];
}

/**
 * The Platform document after smart defaults.
 * @public
 */
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
 * @public
 */
export interface ResolvedModel {
  project: { id: string; name?: string; environment: string };
  /** The standard: its id, packs and governance section as written, when it has one. */
  standard: { id: string; packs: string[]; governance?: GovernanceDoc };
  platform: ResolvedPlatform;
  layers: string[];
  /** Names that are not per table. */
  names: { pipeline: string; job: string };
  tables: ResolvedTable[];
  /** The data products, by id; empty when there are none. */
  products: ResolvedProduct[];
  /**
   * Resolved with `deployTime` only: each `${envvar:…}` the pipeline that deploys the
   * files supplies, once per name, in the order first resolved (specification section 1.1).
   */
  deployValues?: DeployValue[];
  /**
   * Each intent value a table uses through a platform feature in preview, whatever the
   * standard's `features` says (specification section 11.5); empty when there are none.
   */
  previewFeatures: PreviewFeature[];
  /**
   * The standard's operations policy, with defaults filled and `fixed.operations` over it
   * (specification section 11.6).
   */
  operations: ResolvedOperations;
  /** True when the standard keeps quality results (`quality.results`). */
  qualityResults: boolean;
}

/**
 * An intent value a table uses through a platform feature in preview.
 * @example { table: "orders", path: "load.mode", value: "changes", pack: "databricks", status }
 * @public
 */
export interface PreviewFeature {
  /** The table's name. */
  table: string;
  /** The intent path, such as `load.mode`. */
  path: string;
  /** The value, such as `changes`; absent for a path whose value is any text. */
  value?: string;
  /** The pack of the step that applies it. */
  pack: string;
  /** The feature's release status, as the pack declares it. */
  status: FeatureStatus;
}

/**
 * A value the deploying pipeline supplies. Wherever the model holds `text`, the value
 * goes; a pack makes it a parameter of its files that no environment sets.
 * @example
 * { name: "LANDING", text: "${envvar:LANDING}", uses: [{ file: "project.yaml", pointer: "/values/landing" }] }
 * @public
 */
export interface DeployValue {
  /** The variable's name. */
  name: string;
  /** What stands for the value in the model's text: `${envvar:NAME}`. */
  text: string;
  /**
   * Each value it feeds: the file, the JSON Pointer of the value in that file's document,
   * and the line of the reference when it is written in that file.
   */
  uses: { file: string; pointer: string; line?: number }[];
}

/**
 * A data product (ODPS) and the tables that build its outputs in this environment.
 * @public
 */
export interface ResolvedProduct {
  id: string;
  name?: string;
  version?: string;
  domain?: string;
  type?: string;
  status?: string;
  deprecated: boolean;
  purpose?: string;
  usage?: string;
  limitations?: string;
  team: { username: string; name?: string; role?: string }[];
  /** Team members whose role is `owner`, in any case. */
  owners: { username: string; name?: string }[];
  support: { channel: string; url: string; tool?: string }[];
  /** Each output port: its contract and the names of the tables built from it here. */
  outputs: { name: string; contract: string; description?: string; tables: string[] }[];
  /** The product's file. */
  file: string;
}
