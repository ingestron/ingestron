// Public API of @ingestron/core.

// The built-in packs.
export { packs } from "./packs/packs.js";

// A project's generation: every environment resolved, and each pack's output.
export {
  environmentOutputs,
  generateAll,
  type Generated,
  type Output,
} from "./project/build-outputs.js";
export {
  generatedOutputs,
  type GeneratedOutput,
  type GeneratedOutputs,
  type GeneratedOutputsOptions,
} from "./project/generated-outputs.js";
export { environmentsToGenerate } from "./project/environments.js";
export { environmentReportsText, packReportsText } from "./project/report-text.js";
export type { Report } from "./project/resolve-environments.js";

// Comparing two environments.
export { compareEnvironments, tableFacts } from "./compare/compare.js";

// The platform request.
export { platformRequest, requestFor } from "./request/request.js";

// The data product passport.
export { passports } from "./passport/passport.js";
export { lineage } from "./passport/passport-lineage.js";

// Creating a project: templates, routes, recipes and samples.
export {
  builtInTemplates,
  parseTemplate,
  readTemplate,
  templateSchema,
  type Template,
} from "./scaffold/templates.js";
export {
  listSamples,
  readSample,
  sampleFacts,
  templatesFolder,
  type Sample,
  type SampleFacts,
} from "./scaffold/samples.js";
export {
  projectRoutes,
  projectSources,
  type ProjectRoute,
  type ProjectSource,
} from "./scaffold/project-choices.js";
export { composableRecipe, projectRecipe, type ProjectRecipe } from "./scaffold/project-recipes.js";
export {
  ignoredText,
  nameProblem,
  projectId,
  scaffoldFiles,
  writeScaffold,
  type Answers,
} from "./scaffold/scaffold.js";
export { resolvedFiles, type Source } from "./scaffold/init-files.js";
export { projectReadme } from "./scaffold/init-readme.js";
export { stillToReplace } from "./scaffold/init-summary.js";
export { methodSettings } from "./scaffold/init-platform.js";
export { projectValues } from "./scaffold/init-values.js";
export { applySet } from "./scaffold/init-set.js";
export { contractFromSample, objectName } from "./scaffold/sample-contract.js";
