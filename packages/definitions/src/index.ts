// Public API of @ingestron/definitions.
export type { DefinitionCode } from "./diagnostics/diagnostics.js";
export { NO_STORE } from "./choose/choose.js";
export { codeHelp } from "./diagnostics/codes.js";
export { contractReads } from "./documents/contract-notes.js";
export { contractCommon, contractUseOf } from "./contracts/contract-use.js";
export { compareTargets, type TargetComparison, type TargetDifference } from "./pack/compare-targets.js";
export {
  environmentsDiagnostics,
  type EnvironmentsBuild,
  type EnvironmentsCode,
  type EnvironmentsProblem,
  type PackNotice,
  type SuppliedValue,
} from "./pack/environments.js";
export { checkFold, splitDeployText, type FoldView } from "./pack/fold.js";
export { loadingCodeHelp, type LoadingStage } from "./diagnostics/loading-codes.js";
export { packLoadProblem } from "./reference/platform-fields.js";
export { replaceMe } from "./resolve/replace-me.js";
export { kinds, packageSchema, type GovernanceDoc } from "./documents/documents.js";
export { passportFile } from "./platform/products.js";
export type {
  ChosenBy,
  Column,
  Contract,
  ContractRole,
  DeployValue,
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
} from "./pack/model.js";
export { nameVariables } from "./tables/naming.js";
export type { TableCheck } from "./pack/table-checks.js";
export type { Capability } from "./pack/pack.js";
export {
  anchorOf,
  documentReference,
  methodReference,
  referenceKinds,
  type FieldInfo,
} from "./reference/reference.js";
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
} from "./pack/pack.js";
export {
  loadDefinitions,
  resolveDefinitions,
  type ResolveOptions,
  type ResolveResult,
} from "./resolve/resolve.js";
export { fullNameText } from "./tables/tables.js";

// Types from @ingestron/config that appear in this package's API, so a pack
// needs only @ingestron/definitions.
export type {
  AnyDiagnostic,
  DiagnosticCode,
  FileSource,
  JsonSchema,
  KindDefinition,
} from "@ingestron/config";
