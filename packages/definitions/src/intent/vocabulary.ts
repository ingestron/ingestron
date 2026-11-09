// The intent vocabulary (specification section 11.1): what a standard, a flow
// or a transform says about how data is loaded, kept and run, in words that
// belong to no engine. Packs map the words to their platform.

/**
 * How a flow table's data leaves the source: new files only, rows past a
 * cursor, the source's change log, or the whole object each run.
 * @public
 */
export type LoadMode = "files" | "incremental" | "changes" | "full";

/**
 * What is kept per key: every row as it arrived, the latest row, every version,
 * or every version with valid and recorded time.
 * @public
 */
export type History = "none" | "latest" | "full" | "bitemporal";

/**
 * What happens to a row deleted at the source: marked and kept, removed, or
 * ignored.
 * @public
 */
export type DeleteMode = "soft" | "hard" | "keep";

/**
 * A value an audit column holds. Each is one column, named `_<value>` unless
 * the standard renames it.
 * @public
 */
export type AuditValue =
  | "loaded_at"
  | "run_id"
  | "source_file"
  | "source_modified_at"
  | "source_object"
  | "source_connection"
  | "window_start"
  | "window_end"
  | "row_hash";

/**
 * A named storage feature. A pack maps it to what its engine has.
 * @public
 */
export type StorageFeature =
  "change_feed" | "row_tracking" | "deletion_vectors" | "type_widening" | "iceberg_reads";

/**
 * Intent for one table, from the standard, its layer, a flow or a transform.
 * @public
 */
export interface Intent {
  load?: { mode?: LoadMode; cursor?: string; deletes?: { mode?: DeleteMode; when?: string } };
  history?: History;
  sequence?: string;
  audit?: { value: AuditValue; as: string }[];
  rescued?: boolean;
  retention?: { time_travel?: string; log?: string; landed_files?: string };
  storage?: { clustering?: "auto" | "none" | "keys"; features?: StorageFeature[] };
}

/**
 * Every intent path and its values, for coverage maps; `*` where any text is a value.
 * @public
 */
export const intentPaths: Record<string, readonly string[]> = {
  "load.mode": ["files", "incremental", "changes", "full"],
  "load.cursor": ["*"],
  "load.deletes.mode": ["soft", "hard", "keep"],
  "load.deletes.when": ["*"],
  history: ["none", "latest", "full", "bitemporal"],
  sequence: ["*"],
  audit: [
    "loaded_at",
    "run_id",
    "source_file",
    "source_modified_at",
    "source_object",
    "source_connection",
    "window_start",
    "window_end",
    "row_hash",
  ],
  rescued: ["true"],
  "retention.time_travel": ["*"],
  "retention.log": ["*"],
  "retention.landed_files": ["*"],
  "storage.clustering": ["auto", "none", "keys"],
  "storage.features": [
    "change_feed",
    "row_tracking",
    "deletion_vectors",
    "type_widening",
    "iceberg_reads",
  ],
  "operations.trigger": ["schedule", "files", "upstream", "continuous"],
  "operations.retries": ["*"],
  "operations.timeout": ["*"],
  "operations.alerts": ["failure", "slow"],
  "operations.concurrency": ["*"],
  "quality.results": ["true"],
};

/**
 * The names of a standard's layers, in order, whether each is written as text
 * or as an object with a `name`; undefined when the standard lists none.
 * @public
 */
export function layerNames<Layer extends string | { name: string }>(
  layers: readonly Layer[] | undefined,
): string[] | undefined {
  return layers?.map((layer) => (typeof layer === "string" ? layer : layer.name));
}
