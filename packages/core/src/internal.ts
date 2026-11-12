// @ingestron/core/internal: names other Ingestron packages use, such as the
// command line. Not part of the public API; they may change in any release.

export {
  environmentOutputs,
  environmentReportsText,
  environmentsToGenerate,
  notAppliedHeading,
  packReportsText,
  reportsText,
} from "./generation/index.js";
export { tableFacts } from "./compare/index.js";
export { requestFor } from "./request/index.js";
export { lineage, passports } from "./passport/index.js";
export { sourceRequestFor } from "./sources/index.js";
export {
  applySet,
  composableRecipe,
  ignoredText,
  kitFiles,
  kitTemplate,
  methodSettings,
  objectName,
  projectReadme,
  projectValues,
  readTemplate,
  resolvedFiles,
  scaffoldFiles,
  stillToReplace,
  writeScaffold,
  type Answers,
  type Source,
} from "./scaffold/index.js";
export {
  compareVersions,
  isId,
  isRange,
  satisfies,
  standardsKitsFolder,
  versionProblem,
  withoutCredentials,
} from "./kits/index.js";
