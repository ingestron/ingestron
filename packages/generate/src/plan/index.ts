// The plan module: what the rest of the package uses.
export { formatPlan, type FormatOptions } from "./format.js";
export {
  planGeneration,
  seenOf,
  type Change,
  type ChangeKind,
  type ConflictReason,
  type Plan,
  type Seen,
} from "./plan.js";
