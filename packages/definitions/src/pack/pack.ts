// What a pack declares: its methods, its smart defaults and how it builds files.
import type { JsonSchema } from "@ingestron/config";
import type { Intent, IntentUse, SettingAlias } from "../intent/index.js";
import type { EnvironmentsBuild } from "./environments.js";
import type { Column, ResolvedModel, ResolvedTable } from "./model.js";

/**
 * The steps a table goes through.
 * @public
 */
export type Action = "ingest" | "transform" | "store" | "serve";

/**
 * What one action hands to the next.
 * @public
 */
export type Handover = "files" | "table" | "query";

/**
 * Facts a pack's `when` rule can match, plus the method it chooses and settings for that
 * case. A standard's rules may also match the table's declared load mode and history,
 * classification, tag, product and domain; a pack's rules match only these.
 * @public
 */
export interface Rule {
  connectivity?: string;
  connector?: string;
  input?: Handover;
  layer?: string;
  use: string;
  with?: Record<string, unknown>;
}

/**
 * One way to perform one action.
 * @public
 */
export interface Method {
  action: Action;
  description: string;
  /** Ingest only: connectors this method can read. */
  connectors?: string[];
  /** Ingest only: connectivity it supports (`public`, `workspace`, `private`). Default: any. */
  connectivity?: string[];
  /** Transform and store: what the previous action must hand over. */
  accepts?: Handover[];
  produces: Handover;
  /** Ingest only: hands over columns under their contract names, renamed from `physicalName`. */
  renames?: boolean;
  /** The smart defaults, before the standard and the definitions. */
  defaults?: Record<string, unknown>;
  /** JSON Schema for the merged settings. */
  settings: JsonSchema;
  /**
   * The intent this method applies when nothing declares it, filled in after methods are
   * chosen (specification section 11.3).
   * @example intentDefaults: { history: "none" }
   */
  intentDefaults?: Intent;
  /**
   * Settings that are other names for intent, by setting (specification section 11.4).
   * @example aliases: { mode: { values: { append: { history: "none" } } }, sequence_by: { path: "sequence" } }
   */
  aliases?: Record<string, SettingAlias>;
  /**
   * What differs on this method from its pack's `intent`: found first when the method's
   * step judges a value (specification section 11.5).
   * @example intent: { history: { use: "not-applicable", reason: "A view keeps no history." } }
   */
  intent?: Record<string, IntentUse>;
  /**
   * Where settings usually belong: `platform` (such as shared infrastructure)
   * or `standard` (such as a schedule). The others belong in the definitions.
   */
  placement?: { platform?: string[]; standard?: string[] };
  /** Checks that need the whole table, such as keys for change data. Returns messages. */
  check?(table: ResolvedTable): string[];
  /**
   * Where this method's data lands for a table, when other packs can read it
   * there; recorded as the step's `output`.
   * @example output: (table) => ({ location: `abfss://landing@acct.dfs.core.windows.net/${table.name}.parquet`, format: "parquet", loads: "replace" })
   */
  output?(table: ResolvedTable): StepOutput | undefined;
  /**
   * Serve methods: true when the method reads where the previous step's data
   * lands, so that step must record an `output`.
   */
  needsOutput?: true;
  /**
   * Ingest methods: `landed` when the method reads the files another pack's
   * method lands. It is chosen only in an environment that runs on its pack.
   */
  reads?: "landed";
}

/**
 * Where a step's data ends up, for packs that read it.
 * @public
 */
export interface StepOutput {
  /** A URL or path: one file, or a pattern with `*` (one level) or `**` (any depth). */
  location: string;
  format: "parquet" | "json" | "csv" | "delta";
  /** `replace`: each run replaces what is there; `add`: each run adds files. */
  loads: "replace" | "add";
  /**
   * Columns the files carry beyond the contract, in order, such as the audit
   * columns ADF adds; packs that read the files keep them after the contract's.
   */
  columns?: Column[];
}

/**
 * Name patterns (Liquid).
 * @public
 */
export interface Naming {
  catalog: string;
  schema: string;
  table: string;
  pipeline: string;
  job: string;
}

/**
 * A kind of source a pack reads, described for the documentation.
 * @public
 */
export interface Connector {
  /** Native table reading facts, derived from the source's validation rules.
   * @example { query: "optional", sourceOptions: [], format: "parquet" }
   */
  reading?: {
    query: "required" | "optional" | "unsupported";
    sourceOptions: string[];
    format: string;
    runtime?: "azure" | "self-hosted";
  };
  /** Discovery category, such as "Files and storage"; it never changes method selection. */
  category?: string;
  /** The connection's `connector` value, such as `sqlserver`. */
  id: string;
  /** The name readers know, such as "SQL Server". */
  title: string;
  /** The method that reads it. */
  method: string;
  /** How a flow table's `object` is written for this connector. */
  object: string;
  /** The connection settings it needs. A secret is written `${secret:<name>}`. */
  settings: {
    name: string;
    description: string;
    secret?: boolean;
    optional?: boolean;
    type?: "text" | "number" | "object";
    values?: string[];
    /**
     * A value `ingestron init` writes for the setting: a number, true or false, or one of
     * `values`; a choice that suits most projects, never a stand-in for the owner's value.
     */
    default?: string | number | boolean;
    /**
     * One sentence on where the owner finds the value, shown in a new project's README.md.
     * @example "Your database administrator; SSMS shows it as the server name."
     */
    find?: string;
    /**
     * What the value could look like, with `<placeholders>` for the parts the owner fills in;
     * shown beside a `REPLACE_ME`, never written by `ingestron init`.
     * @example "/Volumes/<catalog>/<schema>/<volume>"
     */
    suggest?: string;
  }[];
  /** What the pack generates for it, in a short phrase. */
  generates: string;
  /** Maturity on the platform as the vendor states it, and when it was checked. */
  maturity?: { status: string; checked: string };
  /** The vendor's documentation for this connector. */
  docs: string;
}

/**
 * What a pack does with one contract field: `used` (and what it does; with
 * `whole`, the fields under it are read as part of it),
 * `not-yet` (and why), `elsewhere` (another pack or step handles it, and how),
 * or `documentation` (never affects what is generated).
 * @public
 */
export type ContractUse =
  | { use: "used"; does: string; whole?: boolean; needs?: string }
  | { use: "not-yet"; reason: string }
  | { use: "elsewhere"; reason: string }
  | { use: "documentation" };

/**
 * A feature that changes shared objects on the platform, turned on with
 * `manage.<id>` in the platform, with what it needs there, in words.
 * @public
 */
export interface Capability {
  id: "schemas" | "tags" | "comments" | "checks";
  title: string;
  does: string;
  needs: string[];
}

/**
 * Everything about a pack except how it builds files.
 * @public
 */
export interface PackInfo {
  id: string;
  version: number;
  defaults: {
    naming: Naming;
    layers: string[];
    /** Platform type per contract logicalType. */
    types: Record<string, string>;
    quality: { required: "warn" | "drop" | "fail"; default: "warn" | "drop" | "fail" };
  };
  /** The pack's own choice per action, used after the standard's `when` rules. */
  rules: Partial<Record<Action, { default?: string; when?: Rule[] }>>;
  methods: Record<string, Method>;
  /** The features that change shared objects, each turned on in the platform. */
  capabilities?: Capability[];
  /**
   * The Platform fields the pack reads, for tools to show, keys joined with `.`. Each must be
   * the path of an entry of `documentReference("Platform")`, or resolution refuses the pack.
   * @example ["mode", "schedule.paused", "manage.checks"]
   */
  platformFields?: string[];
  /**
   * The schema of the pack's section of the Platform, the mapping under the key named for
   * the pack's id (specification section 7.2). Without it the section may only be empty.
   * `platformFields` may then list its fields as `<id>.<path>`.
   * @example { type: "object", additionalProperties: false, properties: { warehouse_id: { type: "string" } } }
   */
  platformSection?: JsonSchema;
  /** What the pack does with each ODCS contract field, by field path (`*` for any item). */
  contract?: Record<string, ContractUse>;
  /**
   * What the pack does with each intent path and value, by `path` or `path=value`; a path
   * takes its own entry, else the nearest above it (specification section 11.5).
   * @example intent: { "history=full": { use: "not-yet", reason: "History is not kept yet." } }
   */
  intent?: Record<string, IntentUse>;
  /** The connectors this pack's ingest methods read, for the documentation. */
  connectors?: Connector[];
  /** Checks on the whole resolved model, such as platform settings the pack cannot build yet. */
  check?(model: ResolvedModel): string[];
}

/**
 * One section of the request for the platform team, such as the schedules.
 * Sections with the same title from several packs are shown as one.
 * @public
 */
export interface RequestSection {
  title: string;
  /** A sentence before the list, such as what the reader should do with it. */
  intro?: string;
  /** Markdown list items, without the leading "- ". */
  lines: string[];
}

/**
 * A complete pack: its information plus a build function that returns the
 * output files, path → text, for one resolved environment, and optionally one
 * that builds every environment together (specification section 2.1).
 * @example
 * const pack: Pack = { ...info, build: (model) => ({ "README.md": `# ${model.project.id}\n` }) };
 * @public
 */
export interface Pack extends PackInfo {
  build(model: ResolvedModel): Record<string, string>;
  /**
   * The files for every target at once: one artefact that the deploying pipeline promotes
   * from environment to environment. `models` maps each target's name to its model, in
   * project.yaml's order, each resolved with `deployTime`. A value is a parameter only
   * where targets differ or where it is a deploy-time value; substituting a target's
   * values into the files gives exactly that target's files alone.
   * @example
   * const { files, problems } = pack.buildEnvironments({ dev: devModel, prod: prodModel });
   */
  buildEnvironments?(models: Readonly<Record<string, ResolvedModel>>): EnvironmentsBuild;
  /** What the generated files expect of the platform, for `ingestron request`. Nothing here is checked. */
  request?(model: ResolvedModel): RequestSection[];
}
