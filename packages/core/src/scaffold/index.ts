// The scaffold module: what the rest of the package uses.
export { resolvedFiles, type Source } from "./init-files.js";
export { kitFiles, kitTemplate } from "./init-kit.js";
export { methodSettings } from "./init-platform.js";
export { projectReadme } from "./init-readme.js";
export { applySet } from "./init-set.js";
export { stillToReplace } from "./init-summary.js";
export { projectValues } from "./init-values.js";
export {
  projectRoutes,
  projectSources,
  type ProjectRoute,
  type ProjectSource,
} from "./project-choices.js";
export { composableRecipe, projectRecipe, type ProjectRecipe } from "./project-recipes.js";
export { contractFromSample, objectName } from "./sample-contract.js";
export {
  listSamples,
  readSample,
  sampleFacts,
  templatesFolder,
  type Sample,
  type SampleFacts,
} from "./samples.js";
export {
  ignoredText,
  nameProblem,
  projectId,
  scaffoldFiles,
  writeScaffold,
  type Answers,
} from "./scaffold.js";
export {
  builtInTemplates,
  parseTemplate,
  readTemplate,
  templateSchema,
  type Template,
} from "./templates.js";
