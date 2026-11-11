// The documents module: what the rest of the package uses.
export type { CleanseDoc, ColumnCleanseDoc } from "./cleanse-docs.js";
export { contractNotes, contractReads } from "./contract-notes.js";
export {
  kinds,
  packageSchema,
  type ActionDoc,
  type AcceptDoc,
  type AlertDoc,
  type ConnectionDoc,
  type ContractDoc,
  type ExpectationDoc,
  type FlowDoc,
  type PlatformDoc,
  type ProductDoc,
  type StandardDoc,
  type TransformDoc,
} from "./documents.js";
export {
  movedFieldPointer,
  movedFields,
  movedTo,
  namesMovedHome,
  sectionsOf,
  withMovedFields,
  type MovedField,
} from "./platform-fields.js";
export type { FilterMatch, GovernanceDoc } from "./governance-docs.js";
export type { RuleDoc, RulesDoc } from "./rules.js";
