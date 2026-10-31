// What a pack declares: its methods, its smart defaults and how it builds files.
import type { JsonSchema } from "@ingestron/config";
import type { ResolvedModel, ResolvedTable } from "./model.js";

/** The steps a table goes through. */
export type Action = "ingest" | "transform" | "store" | "serve";

/** What one action hands to the next. */
export type Handover = "files" | "table" | "query";

/** Facts a `when` rule can match, plus the method it chooses and settings for that case. */
export interface Rule {
  connectivity?: string;
  connector?: string;
  input?: Handover;
  layer?: string;
  use: string;
  with?: Record<string, unknown>;
}

/** One way to perform one action. */
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
}

/** Where a step's data ends up, for packs that read it. */
export interface StepOutput {
  /** A URL or path: one file, or a pattern with `*` (one level) or `**` (any depth). */
  location: string;
  format: "parquet" | "json" | "csv" | "delta";
  /** `replace`: each run replaces what is there; `add`: each run adds files. */
  loads: "replace" | "add";
}

/** Name patterns (Liquid). */
export interface Naming {
  catalog: string;
  schema: string;
  table: string;
  pipeline: string;
  job: string;
}

/** A kind of source a pack reads, described for the documentation. */
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
 */
export type ContractUse =
  | { use: "used"; does: string; whole?: boolean; needs?: string }
  | { use: "not-yet"; reason: string }
  | { use: "elsewhere"; reason: string }
  | { use: "documentation" };

/**
 * A feature that changes shared objects on the platform, turned on with
 * `manage.<id>` in the platform, with what it needs there, in words.
 */
export interface Capability {
  id: "schemas" | "tags" | "comments" | "checks";
  title: string;
  does: string;
  needs: string[];
}

/** Everything about a pack except how it builds files. */
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
  /** What the pack does with each ODCS contract field, by field path (`*` for any item). */
  contract?: Record<string, ContractUse>;
  /** The connectors this pack's ingest methods read, for the documentation. */
  connectors?: Connector[];
  /** Checks on the whole resolved model, such as platform settings the pack cannot build yet. */
  check?(model: ResolvedModel): string[];
}

/**
 * One section of the request for the platform team, such as the schedules.
 * Sections with the same title from several packs are shown as one.
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
 * output files, path → text, for one resolved environment.
 * @example
 * const pack: Pack = { ...info, build: (model) => ({ "README.md": `# ${model.project.id}\n` }) };
 */
export interface Pack extends PackInfo {
  build(model: ResolvedModel): Record<string, string>;
  /** What the generated files expect of the platform, for `ingestron request`. Nothing here is checked. */
  request?(model: ResolvedModel): RequestSection[];
}
