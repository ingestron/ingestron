// Public API of @ingestron/definitions.
export type { DefinitionCode } from "./diagnostics.js";
export { NO_STORE } from "./choose.js";
export { codeHelp } from "./codes.js";
export { contractReads } from "./contract-notes.js";
export { contractCommon, contractUseOf } from "./contract-use.js";
export { loadingCodeHelp, type LoadingStage } from "./loading-codes.js";
export { kinds, packageSchema, type GovernanceDoc } from "./documents.js";
export { passportFile } from "./products.js";
export type {
  ChosenBy,
  Column,
  Contract,
  ContractRole,
  Expectation,
  FullName,
  Grant,
  Origin,
  Permission,
  ResolvedModel,
  ResolvedPlatform,
  ResolvedProduct,
  ResolvedTable,
  Schedule,
  Step,
} from "./model.js";
export { nameVariables } from "./naming.js";
export type { TableCheck } from "./table-checks.js";
export type { Capability } from "./pack.js";
export {
  anchorOf,
  documentReference,
  methodReference,
  referenceKinds,
  type FieldInfo,
} from "./reference.js";
export type {
  Action,
  Connector,
  ContractUse,
  Handover,
  Method,
  Naming,
  Pack,
  RequestSection,
  PackInfo,
  Rule,
  StepOutput,
} from "./pack.js";
export {
  loadDefinitions,
  resolveDefinitions,
  type ResolveOptions,
  type ResolveResult,
} from "./resolve.js";
export { fullNameText } from "./tables.js";

// Types from @ingestron/config that appear in this package's API, so a pack
// needs only @ingestron/definitions.
export type {
  AnyDiagnostic,
  DiagnosticCode,
  FileSource,
  JsonSchema,
  KindDefinition,
} from "@ingestron/config";
