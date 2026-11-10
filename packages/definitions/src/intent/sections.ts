// The intent sections of a standard as written (specification section 11.1):
// the shapes of its `audit`, `operations` and object layers.
import type { LayerDuty } from "./coverage.js";
import type { AuditValue, DeleteMode, History, Intent, LoadMode } from "./vocabulary.js";

/** Audit columns as written: a value, or a value with the column's name. */
export type AuditDoc = (AuditValue | { value: AuditValue; as: string })[];

/** The standard's operations policy (specification section 11.1). */
export interface OperationsDoc {
  schedule?: { per: "project" | "flow" };
  trigger?: "schedule" | "files" | "upstream" | "continuous";
  retries?: { count: number; interval: string };
  timeout?: string;
  alerts?: { on: ("failure" | "slow")[]; slow_after?: string };
  concurrency?: { max_runs: number; queue: boolean };
  require_tags?: string[];
}

/** A layer written as an object: its name, and the intent every table in it starts from. */
export interface LayerDoc {
  name: string;
  history?: History;
  audit?: AuditDoc;
  rescued?: boolean;
  retention?: Intent["retention"];
  /** What the layer does with its rows: `raw`, or the duties it lists (specification section 5). */
  does?: "raw" | LayerDuty[];
  quality?: { required?: "warn" | "drop" | "fail"; default?: "warn" | "drop" | "fail" };
}

/** What a `Standard` document says about intent, apart from its layers. */
export interface StandardIntentDoc {
  load?: {
    default?: LoadMode;
    deletes?: DeleteMode;
    /** Rules like a method's `when`, choosing how data is loaded. */
    when?: {
      connectivity?: string;
      connector?: string;
      input?: string;
      layer?: string;
      use: LoadMode;
    }[];
  };
  storage?: Intent["storage"];
  retention?: Intent["retention"];
  audit?: AuditDoc;
  rescued?: boolean;
  operations?: OperationsDoc;
  /** Intent that nothing below the standard may change. */
  fixed?: Omit<Intent, "audit"> & { audit?: AuditDoc; operations?: OperationsDoc };
}

/** What a flow, a flow table or a transform says about the history and audit of its tables. */
export interface TableIntentDoc {
  history?: History;
  sequence?: string;
  audit?: AuditDoc;
}

/** What a flow or a flow table also says about how data is loaded. */
export interface FlowIntentDoc extends TableIntentDoc {
  load?: Intent["load"];
}
