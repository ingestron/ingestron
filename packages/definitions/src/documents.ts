// The document kinds, their schemas and their TypeScript shapes. The shapes
// mirror the schemas in ../schemas, which are the source of truth.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineKind, type JsonSchema } from "@ingestron/config";
import { parse } from "yaml";

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

/** A `when` rule as written in a standard. */
export interface RuleDoc {
  connectivity?: string;
  connector?: string;
  input?: string;
  layer?: string;
  use: string;
  with?: Record<string, unknown>;
}

/** Per-action rules as written in a standard. */
export interface RulesDoc {
  default?: string;
  allowed?: string[];
  when?: RuleDoc[];
  settings?: Record<string, Record<string, unknown>>;
  fixed?: Record<string, Record<string, unknown>>;
}

/** A `Standard` document. */
export interface StandardDoc {
  id: string;
  packs: string[];
  naming?: Record<string, string>;
  layers?: string[];
  types?: Record<string, string>;
  quality?: { required?: "warn" | "drop" | "fail"; default?: "warn" | "drop" | "fail" };
  ingest?: RulesDoc;
  transform?: RulesDoc;
  store?: RulesDoc;
  serve?: RulesDoc;
}

/** A `Platform` document; see platform.schema.yaml for every field. */
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
  manage?: { schemas?: boolean; tags?: boolean; comments?: boolean; checks?: boolean };
  grants?: Record<string, { principal: string; privileges: string[] }[]>;
}

/** A `Connection` document. */
export interface ConnectionDoc {
  id: string;
  connector: string;
  connectivity: string;
  settings?: Record<string, unknown>;
}

/** One table of a flow. */
export interface FlowTableDoc {
  object: string;
  contract: string;
  expectations?: ExpectationDoc[];
  ingest?: { with?: Record<string, unknown> };
  store?: { with?: Record<string, unknown> };
  serve?: { with?: Record<string, unknown> };
}

/** A `Flow` document. */
export interface FlowDoc {
  id: string;
  source: string;
  layer?: string;
  tables: Record<string, FlowTableDoc>;
  ingest?: ActionDoc;
  store?: ActionDoc;
  serve?: ActionDoc;
}

/** A `Transform` document. */
export interface TransformDoc {
  id: string;
  layer?: string;
  inputs: string[];
  code: string;
  contract: string;
  expectations?: ExpectationDoc[];
  transform?: ActionDoc;
  store?: ActionDoc;
  serve?: ActionDoc;
}

/** The parts of an ODCS v3.1.0 contract that are used. */
export interface ContractDoc {
  id: string;
  schema?: {
    name: string;
    description?: string;
    properties?: {
      name: string;
      logicalType?: string;
      physicalType?: string;
      required?: boolean;
      primaryKey?: boolean;
      primaryKeyPosition?: number;
      physicalName?: string;
      description?: string;
      /** ODCS quality rules on the column. */
      quality?: unknown;
      unique?: boolean;
      /** Limits for the logical type, such as maxLength, checked on every row. */
      logicalTypeOptions?: unknown;
      tags?: unknown[];
      classification?: string;
    }[];
    /** ODCS quality rules on the whole object. */
    quality?: unknown;
    tags?: unknown[];
  }[];
}

/** A schema shipped in ../schemas. */
export function packageSchema(file: string): JsonSchema {
  const text = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../schemas", file),
    "utf8",
  );
  return (file.endsWith(".json") ? JSON.parse(text) : parse(text)) as JsonSchema;
}

const apiVersion = "ingestron.io/v1";

/** The document kinds, ready for `@ingestron/config`. */
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
  contract: defineKind<ContractDoc>({
    apiVersion: "v3.1.0",
    kind: "DataContract",
    schema: packageSchema("odcs-v3.1.0.schema.json"),
  }),
};
