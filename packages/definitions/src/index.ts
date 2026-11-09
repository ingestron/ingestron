// Public API of @ingestron/definitions.

// Resolving: definitions in, one resolved model per environment out.
export {
  loadDefinitions,
  replaceMe,
  resolveDefinitions,
  type ResolveOptions,
  type ResolveResult,
} from "./resolve/index.js";

// The pack contract: what a pack declares, the resolved model it receives,
// and the helpers packs use to compare and fold environments.
export {
  checkFold,
  compareTargets,
  environmentsDiagnostics,
  splitDeployText,
  type Action,
  type Capability,
  type ChosenBy,
  type Column,
  type Connector,
  type Contract,
  type ContractRole,
  type ContractUse,
  type DeployValue,
  type EnvironmentsBuild,
  type EnvironmentsCode,
  type EnvironmentsProblem,
  type Expectation,
  type FoldView,
  type FullName,
  type Grant,
  type Handover,
  type Method,
  type Naming,
  type Origin,
  type Pack,
  type PackInfo,
  type PackNotice,
  type Permission,
  type RequestSection,
  type ResolvedModel,
  type ResolvedPlatform,
  type ResolvedProduct,
  type ResolvedTable,
  type Rule,
  type Schedule,
  type Step,
  type StepOutput,
  type SuppliedValue,
  type TableCheck,
  type TargetComparison,
  type TargetDifference,
} from "./pack/index.js";

// Documents: the kinds a project holds and the schemas the package ships.
export { contractReads, kinds, packageSchema, type GovernanceDoc } from "./documents/index.js";

// Choosing methods: the store choice that keeps landed files as they are.
export { NO_STORE } from "./choose/index.js";

// Contracts: how each method uses a data contract.
export { contractCommon, contractUseOf } from "./contracts/index.js";

// Tables: full names and the variables naming patterns may use.
export { fullNameText, nameVariables } from "./tables/index.js";

// Platform: the data product passport.
export { passportFile } from "./platform/index.js";

// The settings reference, and the check of a pack's platform fields.
export {
  anchorOf,
  documentReference,
  methodReference,
  packLoadProblem,
  referenceKinds,
  type FieldInfo,
} from "./reference/index.js";

// Diagnostics: every code, what it means and how to fix it.
export {
  codeHelp,
  loadingCodeHelp,
  type DefinitionCode,
  type LoadingStage,
} from "./diagnostics/index.js";

// Types from @ingestron/config that appear in this package's API, so a pack
// needs only @ingestron/definitions.
export type {
  AnyDiagnostic,
  DiagnosticCode,
  FileSource,
  JsonSchema,
  KindDefinition,
} from "@ingestron/config";
