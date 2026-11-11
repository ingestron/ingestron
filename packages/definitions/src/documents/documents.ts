// The document kinds, their schemas and their TypeScript shapes. The shapes
// mirror the schemas in ../schemas, which are the source of truth.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineKind, type JsonSchema } from "@ingestron/config";
import { parse } from "yaml";
import { schemasFolder } from "../folders.js";
import type {
  FlowIntentDoc,
  LayerDoc,
  QualityDoc,
  QuarantineDoc,
  StandardIntentDoc,
  TableIntentDoc,
} from "../intent/index.js";
import type { CleanseDoc, ColumnCleanseDoc } from "./cleanse-docs.js";
import type { GovernanceDoc } from "./governance-docs.js";
import type { RulesDoc } from "./rules.js";
import type { ContractDoc, ProductDoc } from "./exchange-docs.js";
import type { SourceMetadataDoc } from "./source-docs.js";

/** An action's method choice and settings, as written in a flow or transform. */
export interface ActionDoc {
  uses?: string;
  with?: Record<string, unknown>;
}

/** A row check as written. */
export interface ExpectationDoc {
  name: string;
  check: string;
  action?: "warn" | "drop" | "fail";
}

/** A `Standard` document. */
export interface StandardDoc extends StandardIntentDoc {
  id: string;
  packs: string[];
  features?: "ga" | "preview";
  origin?: { standard: string; version: string };
  naming?: Record<string, string>;
  layers?: (string | LayerDoc)[];
  types?: Record<string, string>;
  /** Defaults for the tables' columns (specification section 6.1). */
  cleanse?: { text?: Pick<ColumnCleanseDoc, "trim" | "empty">; timestamps?: { to: string } };
  quality?: QualityDoc;
  ingest?: RulesDoc;
  transform?: RulesDoc;
  store?: RulesDoc;
  serve?: RulesDoc;
  governance?: GovernanceDoc;
  /** How source metadata is compared with contracts (specification section 12.6). */
  sources?: SourcesDoc;
}

/** The `sources` setting of the Standard and of the Platform. */
export interface SourcesDoc {
  /** What a breaking difference between a contract and its source's metadata is. */
  breaking?: "fail" | "warn";
}

/** An alert as the Platform writes it: `on` is `[failure]` when left out. */
export type AlertDoc =
  | { kind: "email"; to: string[]; on?: ("failure" | "slow")[] }
  | { kind: "destination"; id: string; on?: ("failure" | "slow")[] };

/**
 * A `Platform` document; see platform.schema.yaml for every field. The section of each pack
 * is a further key named for the pack: read them with `sectionsOf`.
 */
export interface PlatformDoc {
  id: string;
  workspace?: { host?: string; root_path?: string };
  mode?: "development" | "production";
  run_as?: Record<string, string>;
  compute?: { serverless?: boolean; budget_policy_id?: string; channel?: string };
  naming?: Record<string, string>;
  /** Method settings for this platform, by method, such as shared infrastructure. */
  settings?: Record<string, Record<string, unknown>>;
  tags?: Record<string, string>;
  permissions?: ({ level: string } & Record<string, string>)[];
  schedule?: { cron: string; timezone?: string; paused?: boolean };
  notifications?: { on_failure?: string[] };
  alerts?: AlertDoc[];
  manage?: Partial<
    Record<"schemas" | "tags" | "comments" | "checks" | "grants" | "masks" | "filters", boolean>
  >;
  grants?: Record<string, { principal: string; privileges: string[] }[]>;
  /** Warnings the platform team accepts, each with a reason (specification, Accepted warnings). */
  accept?: AcceptDoc[];
  /** The principal each contract role is on this platform, by role (section 8.2). */
  principals?: Record<string, string>;
  /** How source metadata is compared with contracts; wins over the standard's (section 12.6). */
  sources?: SourcesDoc;
}

/** One entry of the Platform's `accept` list. */
export interface AcceptDoc {
  code: string;
  about?: { file?: string; table?: string; feature?: string };
  reason: string;
}

/** A `Connection` document. */
export interface ConnectionDoc {
  id: string;
  connector: string;
  connectivity: string;
  /** The zone the source writes its timestamps in (specification section 6.3). */
  timezone?: string;
  settings?: Record<string, unknown>;
  /** Where the connection's metadata comes from (specification section 12.2). */
  metadata?: { from: string; with?: Record<string, string> };
}

/** One table of a flow. */
export interface FlowTableDoc extends FlowIntentDoc {
  object: string;
  /** Absent when the table takes its columns and key from source metadata (section 12.4). */
  contract?: string;
  expectations?: ExpectationDoc[];
  quality?: QuarantineDoc;
  cleanse?: CleanseDoc;
  ingest?: { with?: Record<string, unknown> };
  store?: { with?: Record<string, unknown> };
  serve?: { with?: Record<string, unknown> };
}

/** A `Flow` document. */
export interface FlowDoc extends FlowIntentDoc {
  id: string;
  source: string;
  layer?: string;
  tables: Record<string, FlowTableDoc>;
  ingest?: ActionDoc;
  store?: ActionDoc;
  serve?: ActionDoc;
}

/** A `Transform` document. */
export interface TransformDoc extends TableIntentDoc {
  id: string;
  layer?: string;
  inputs: string[];
  /** Absent for a transform with one input: it then reads that table as it is. */
  code?: string;
  contract: string;
  expectations?: ExpectationDoc[];
  quality?: QuarantineDoc;
  cleanse?: CleanseDoc;
  transform?: ActionDoc;
  store?: ActionDoc;
  serve?: ActionDoc;
}

const productKind = (apiVersion: string) =>
  defineKind<ProductDoc>({
    apiVersion,
    kind: "DataProduct",
    schema: packageSchema("odps-v1.1.0.schema.json"),
    links: { "/outputPorts/*/contractId": "DataContract" },
  });

/**
 * A schema shipped in ../schemas.
 * @public
 */
export function packageSchema(file: string): JsonSchema {
  const text = readFileSync(join(schemasFolder, file), "utf8");
  return (file.endsWith(".json") ? JSON.parse(text) : parse(text)) as JsonSchema;
}

const apiVersion = "ingestron.io/v1";

/**
 * The document kinds, ready for `@ingestron/config`.
 * @public
 */
export const kinds = {
  standard: defineKind<StandardDoc>({
    apiVersion,
    kind: "Standard",
    schema: packageSchema("standard.schema.yaml"),
  }),
  platform: defineKind<PlatformDoc>({
    apiVersion,
    kind: "Platform",
    schema: packageSchema("platform.schema.yaml"),
  }),
  connection: defineKind<ConnectionDoc>({
    apiVersion,
    kind: "Connection",
    schema: packageSchema("connection.schema.yaml"),
  }),
  flow: defineKind<FlowDoc>({
    apiVersion,
    kind: "Flow",
    schema: packageSchema("flow.schema.yaml"),
    links: { "/source": "Connection", "/tables/*/contract": "DataContract" },
  }),
  transform: defineKind<TransformDoc>({
    apiVersion,
    kind: "Transform",
    schema: packageSchema("transform.schema.yaml"),
    links: { "/contract": "DataContract" },
  }),
  sourceMetadata: defineKind<SourceMetadataDoc>({
    apiVersion,
    kind: "SourceMetadata",
    schema: packageSchema("source-metadata.schema.yaml"),
    links: { "/connection": "Connection" },
  }),
  contract: defineKind<ContractDoc>({
    apiVersion: "v3.1.0",
    kind: "DataContract",
    schema: packageSchema("odcs-v3.1.0.schema.json"),
  }),
  /** ODPS v1.1.0; `productV1` reads v1.0.0 files with the same schema. */
  product: productKind("v1.1.0"),
  productV1: productKind("v1.0.0"),
};
