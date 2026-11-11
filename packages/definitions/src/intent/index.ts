// The intent module: what the rest of the package uses.
export type { IntentFragment, SettingAlias } from "./aliases.js";
export {
  coverageKey,
  intentCoverageGaps,
  intentUseOf,
  type FeatureStatus,
  type IntentCoverage,
  type IntentUse,
  type LayerDuty,
} from "./coverage.js";
export { resolveOperations, type ResolvedOperations } from "./operations.js";
export {
  type AuditDoc,
  type FlowIntentDoc,
  type LayerDoc,
  type OperationsDoc,
  type QualityDoc,
  type QuarantineDoc,
  type StandardIntentDoc,
  type TableIntentDoc,
} from "./sections.js";
export {
  intentPaths,
  layerNames,
  type AuditValue,
  type DeleteMode,
  type History,
  type Intent,
  type LoadMode,
  type StorageFeature,
} from "./vocabulary.js";
