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
  ChosenBy,
  Column,
  ColumnCleanse,
  Contract,
  ContractRole,
  DeployValue,
  Expectation,
  FullName,
  Grant,
  Origin,
  RowRule,
  Permission,
  PreviewFeature,
  ResolvedModel,
  ResolvedPlatform,
  ResolvedProduct,
  ResolvedTable,
  Schedule,
  Step,
  TableCleanse,
} from "./model.js";
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
export { runsOnProblems } from "./runs-on-pack.js";
export { tableCheckOf, type TableCheck } from "./table-checks.js";
