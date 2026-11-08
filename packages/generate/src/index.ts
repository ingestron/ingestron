// Public API of @ingestron/generate.

// Output folders: where generated files are read and written.
export {
  lockFile,
  manifestFile,
  memoryFolder,
  nodeFolder,
  type Entry,
  type MemoryFolder,
  type MemoryFolderOptions,
  type OutputFolder,
} from "./folder/index.js";

// The manifest: which files Ingestron wrote, by digest.
export { digestOf } from "./manifest/index.js";

// Planning: what would change in an output folder, and the plan as text.
export {
  formatPlan,
  planGeneration,
  type Change,
  type ChangeKind,
  type ConflictReason,
  type FormatOptions,
  type Plan,
  type Seen,
} from "./plan/index.js";

// Applying: writing a clean plan.
export { applyPlan, type ApplyResult } from "./apply/index.js";

// Problems a plan or an apply reports.
export type { Problem, ProblemCode } from "./problems/index.js";
