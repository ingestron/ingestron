// The pack module: what the rest of the package uses.
export { compareTargets, type TargetComparison, type TargetDifference } from "./compare-targets.js";
export {
  deployValueHint,
  environmentsDiagnostics,
  type EnvironmentsBuild,
  type EnvironmentsCode,
  type EnvironmentsProblem,
  type PackNotice,
  type SuppliedValue,
} from "./environments.js";
export { checkFold, splitDeployText, type FoldView } from "./fold.js";
export type {
  Alert,
  Column,
  Contract,
  ContractRole,
  DeployValue,
  Expectation,
  FullName,
  Grant,
  RowRule,
  Permission,
  PreviewFeature,
  ResolvedModel,
  ResolvedPlatform,
  ResolvedProduct,
  ResolvedTable,
  Schedule,
} from "./model.js";
export type { ChosenBy, Origin, Step } from "./step.js";
export type {
  Action,
  Capability,
  Connector,
  ContractUse,
  Handover,
  Method,
  Naming,
  Pack,
  PackInfo,
  RequestSection,
  Rule,
  StepOutput,
} from "./pack.js";
export {
  classificationTag,
  defaultClassificationTag,
  type AccessGrant,
  type ColumnMask,
  type RowFilter,
  type TableAccess,
} from "./access.js";
export type { ColumnCleanse, TableCleanse } from "./cleanse.js";
export { runsOnProblems } from "./runs-on-pack.js";
export { tableCheckOf, type TableCheck } from "./table-checks.js";
