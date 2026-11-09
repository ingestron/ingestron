// The intent module: what the rest of the package uses.
export type { IntentFragment, SettingAlias } from "./aliases.js";
export {
  type AuditDoc,
  type FlowIntentDoc,
  type LayerDoc,
  type OperationsDoc,
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
