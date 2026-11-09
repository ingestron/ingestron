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

/** What is kept, which the step that writes the table applies. */
const writerPaths = ["history", "sequence", "rescued", "retention.time_travel", "retention.log"];

function judgeFor(path: string, value: string | undefined): Judge | undefined {
  if (path.startsWith("load.") || path === "retention.landed_files") return "ingest";
  if (writerPaths.includes(path) || path.startsWith("storage.")) return "writer";
  return path === "audit" && value !== undefined ? auditJudges[value] : undefined;
}

/**
 * The step among `steps` that judges the path, or for `audit` the value: the ingest step
 * for `load.*`, landed files and the source's audit values; the store step, else an ingest
 * step that produces the table, for what is kept and the `loaded_at` and `row_hash` audit
 * values; for `source_file` and `source_modified_at`, the store step when ingest lands
 * files, else ingest. Undefined for any other path, and for `audit` without a value.
 */
export function judgeOf<Candidate extends { method: Method }>(
  path: string,
  steps: readonly Candidate[],
  value?: string,
): Candidate | undefined {
  const acting = (action: string) => steps.find(({ method }) => method.action === action);
  const ingest = acting("ingest");
  switch (judgeFor(path, value)) {
    case "ingest":
      return ingest;
    case "writer":
      return acting("store") ?? (ingest?.method.produces === "table" ? ingest : undefined);
    case "reader":
      return ingest?.method.produces === "files" ? (acting("store") ?? ingest) : ingest;
    default:
      return undefined;
  }
}
