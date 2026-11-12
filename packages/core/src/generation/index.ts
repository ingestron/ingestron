// The generation module: what the rest of the package uses.
export type { ProjectOptions } from "./options.js";
export { environmentOutputs, generateAll, type Generated, type Output } from "./build-outputs.js";
export { environmentsToGenerate, projectEnvironments } from "./environments.js";
export {
  generatedOutputs,
  outputsOf,
  type GeneratedOutput,
  type GeneratedOutputs,
  type GeneratedOutputsOptions,
} from "./generated-outputs.js";
export {
  environmentReportsText,
  notAppliedHeading,
  packReportsText,
  reportsText,
} from "./report-text.js";
export type { Report, ResolvedEnvironment } from "./resolve-environments.js";
