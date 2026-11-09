// Public API of @ingestron/core.

// A project held open: plan, compare and request from one generation.
export { Project } from "./project/index.js";

// The built-in packs.
export { packs } from "./packs/index.js";

// A project's generation: every environment resolved, and each pack's output.
export {
  environmentOutputs,
  environmentReportsText,
  environmentsToGenerate,
  generateAll,
  generatedOutputs,
  packReportsText,
  type Generated,
  type GeneratedOutput,
  type GeneratedOutputs,
  type GeneratedOutputsOptions,
  type Output,
  type ProjectOptions,
  type Report,
} from "./generation/index.js";

// Comparing two environments.
export { compareEnvironments, tableFacts } from "./compare/index.js";

// The platform request.
export { platformRequest, requestFor } from "./request/index.js";

// The data product passport.
export { lineage, passports } from "./passport/index.js";

// Creating a project: templates, routes, recipes and samples.
export {
  applySet,
  builtInTemplates,
  composableRecipe,
  contractFromSample,
  ignoredText,
  listSamples,
  methodSettings,
  nameProblem,
  objectName,
  parseTemplate,
  projectId,
  projectReadme,
  projectRecipe,
  projectRoutes,
  projectSources,
  projectValues,
  readSample,
  readTemplate,
  resolvedFiles,
  sampleFacts,
  scaffoldFiles,
  stillToReplace,
  templateSchema,
  templatesFolder,
  writeScaffold,
  type Answers,
  type ProjectRecipe,
  type ProjectRoute,
  type ProjectSource,
  type Sample,
  type SampleFacts,
  type Source,
  type Template,
} from "./scaffold/index.js";
