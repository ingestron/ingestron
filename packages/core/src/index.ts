// Public API of @ingestron/core.

// A project held open: its generation kept for plan and request, and compare.
export { Project } from "./project/index.js";

// The built-in packs.
export { packs } from "./packs/index.js";

// A project's generation: every environment resolved, and each pack's output.
export {
  generateAll,
  generatedOutputs,
  type Generated,
  type GeneratedOutput,
  type GeneratedOutputs,
  type GeneratedOutputsOptions,
  type Output,
  type ProjectOptions,
  type Report,
} from "./generation/index.js";

// Comparing two environments.
export { compareEnvironments } from "./compare/index.js";

// The platform request.
export { platformRequest } from "./request/index.js";

// Creating a project: templates, routes, recipes and samples.
export {
  builtInTemplates,
  contractFromSample,
  listSamples,
  nameProblem,
  parseTemplate,
  projectId,
  projectRecipe,
  projectRoutes,
  projectSources,
  readSample,
  sampleFacts,
  templateSchema,
  templatesFolder,
  type ProjectRecipe,
  type ProjectRoute,
  type ProjectSource,
  type Sample,
  type SampleFacts,
  type Template,
} from "./scaffold/index.js";

// Kits: published, dated standards.
export { installedKits, kitSchema, parseKitSpec, readKit, type Kit } from "./kits/index.js";

// Source recipes: how to get each kind of source's metadata.
export {
  installedSourceRecipes,
  readSourceRecipe,
  sourceOrigin,
  sourceRecipeSchema,
  sourceRecipes,
  type SourceColumnsField,
  type SourceAsk,
  type SourceReaderName,
  type SourceRecipe,
  type SourceTypeRule,
} from "./sources/index.js";

// Importing source metadata: a file into a connection's document, and what it changed.
export {
  importSource,
  sourceChangesText,
  sourceFileFor,
  withSourcesImport,
  type SourceChange,
  type SourceImport,
  type SourceImportInput,
} from "./sources/index.js";

// The source request: what to ask for each connection's metadata, and how to import it.
export { sourceRequest, type SourceRequestOptions } from "./sources/index.js";
export { draftContracts, type ContractDraft, type DraftContractsOptions } from "./sources/index.js";
