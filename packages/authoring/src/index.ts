// Public API of @ingestron/authoring: what an editor needs to help write an
// Ingestron project, as plain functions over the project's files. The VS Code
// extension adapts these to its API; another editor can do the same.
export {
  annotationsIn,
  generatedLenses,
  type Annotation,
  type GeneratedLens,
} from "./annotations/annotations.js";
export { completionsAt, type Suggestion } from "./assist/completion.js";
export { problems, type Problem } from "./diagnostics/diagnostics.js";
export { codeDocs, docsLinks, docsUrl } from "./docs/docs.js";
export { quickFixes, type QuickFix } from "./assist/fixes.js";
export { moveSetting } from "./assist/moves.js";
export { fixAll } from "./assist/fix-all.js";
export { compareEnvironments, platformRequest } from "./generation/platform-request.js";
export { type HoverOptions } from "./hover/explain.js";
export { hoverAt } from "./hover/hover.js";
export { definitionAt, referencesAt } from "./navigation/navigation.js";
export { fileMoveEdits, renameAt, renameProblem } from "./navigation/rename.js";
export {
  generatedFiles,
  generatedForTable,
  tableAtCursor,
  type Generated,
} from "./generation/preview.js";
export { referenceAt, type ProblemEntry, type ReferenceEntry } from "./reference/reference.js";
export { projectSymbols, type ProjectSymbol } from "./navigation/symbols.js";
export { referenceForDocs } from "./reference/docs-entries.js";
export { inProject, openProject, projectFolderOf, type Project } from "./project/project.js";
export { positionAt, type Position } from "./project/yaml.js";
