// The documents module: what the rest of the package uses.
export { contractNotes, contractReads } from "./contract-notes.js";
export {
  kinds,
  packageSchema,
  type ActionDoc,
  type AlertDoc,
  type ConnectionDoc,
  type ContractDoc,
  type ExpectationDoc,
  type FlowDoc,
  type GovernanceDoc,
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
export type { RuleDoc, RulesDoc } from "./rules.js";
