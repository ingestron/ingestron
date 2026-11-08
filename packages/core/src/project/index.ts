// The project module: what the rest of the package uses.
export { environmentOutputs, generateAll, type Generated, type Output } from "./build-outputs.js";
export { environmentsToGenerate } from "./environments.js";
export {
  generatedOutputs,
  type GeneratedOutput,
  type GeneratedOutputs,
  type GeneratedOutputsOptions,
} from "./generated-outputs.js";
export { environmentReportsText, packReportsText } from "./report-text.js";
export type { Report, ResolvedEnvironment } from "./resolve-environments.js";
