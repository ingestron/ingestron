// Which of a table's steps judges an intent path or value (specification sections 11.3
// and 11.5): the one whose method applies it. Defaults and coverage both ask here.
import type { Method } from "../pack/index.js";

/** Who applies a path or value: the ingest step, the step that writes the table, or the one that reads files. */
type Judge = "ingest" | "writer" | "reader";

/** Each audit value's owning step, so two packs never add the same column. */
const auditJudges: Record<string, Judge> = {
  loaded_at: "writer",
  row_hash: "writer",
  run_id: "ingest",
  window_start: "ingest",
  window_end: "ingest",
  source_object: "ingest",
  source_connection: "ingest",
  source_file: "reader",
  source_modified_at: "reader",
};

/** What is kept, and how deletes reach it, which the step that writes the table applies. */
const writerPaths = ["history", "sequence", "rescued", "retention.time_travel", "retention.log"];

/** What is done to the rows the table keeps: checks and cleansing (specification section 11.7). */
const keptRows = ["quality.rules", "quality.actions", "quality.table-checks", "quality.quarantine"];

/** True for a path the step that writes the table applies. */
function writes(path: string): boolean {
  const kept = keptRows.includes(path) || path.startsWith("cleanse.") || path === "deduplicate";
  return kept || writerPaths.includes(path) || path.startsWith("storage.");
}

function judgeFor(path: string, value: string | undefined): Judge | undefined {
  if (writes(path)) return "writer";
  if (path.startsWith("load.deletes.")) return "writer";
  if (path.startsWith("load.") || path === "retention.landed_files") return "ingest";
  return path === "audit" && value !== undefined ? auditJudges[value] : undefined;
}

/**
 * True for an `audit` value, and for no other path, that only a step reading the source can
 * give: the file reader's (`source_file`, `source_modified_at`) and the ingest step's
 * (`run_id`, `window_start`, `window_end`, `source_object`, `source_connection`). A table
 * with no ingest step, a transform's, has no step to give it.
 */
export function readsSource(path: string, value: string | undefined): boolean {
  const judge = path === "audit" ? judgeFor(path, value) : undefined;
  return judge === "ingest" || judge === "reader";
}

/** What else decides the judging step: the audit value, and whether the table ends at the landed files. */
export interface JudgeOptions {
  /** For `audit`, the value judged. */
  value?: string;
  /** True when the table has no store step and ends at the files ingest lands (`store: none`). */
  endsAtFiles?: boolean;
}

/**
 * The step among `steps` that judges the path, or for `audit` the value: the ingest step
 * for the load mode and cursor, landed files and the source's audit values; the store
 * step, else the ingest step when it produces the table or the table ends at its files,
 * for deletes, what is kept, the checks and cleansing of kept rows and the `loaded_at` and
 * `row_hash` audit values; for `source_file` and
 * `source_modified_at`, the store step when ingest lands files, else ingest. Undefined for
 * any other path, for `audit` without a value, and for a value only a step that reads the
 * source can give (`readsSource`) when there is no ingest step.
 */
export function judgeOf<Candidate extends { method: Method }>(
  path: string,
  steps: readonly Candidate[],
  options: JudgeOptions = {},
): Candidate | undefined {
  const acting = (action: string) => steps.find(({ method }) => method.action === action);
  const ingest = acting("ingest");
  switch (judgeFor(path, options.value)) {
    case "ingest":
      return ingest;
    case "writer":
      return acting("store") ?? (writesTable(ingest, options) ? ingest : undefined);
    case "reader":
      return ingest?.method.produces === "files" ? (acting("store") ?? ingest) : ingest;
    default:
      return undefined;
  }
}

/** True when, with no store step, the ingest step's output is the table: it writes one, or its landed files are it. */
function writesTable(ingest: { method: Method } | undefined, options: JudgeOptions): boolean {
  return ingest?.method.produces === "table" || options.endsAtFiles === true;
}
