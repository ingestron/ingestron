// Public API of @ingestron/authoring: what an editor needs to help write an
// Ingestron project, as plain functions over the project's files. The VS Code
// extension adapts these to its API; another editor can do the same.
export {
  annotationsIn,
  generatedLenses,
  type Annotation,
  type GeneratedLens,
} from "./annotations.js";
export { completionsAt, type Suggestion } from "./completion.js";
export { problems, type Problem } from "./diagnostics.js";
export { codeDocs, docsLinks, docsUrl } from "./docs.js";
export { quickFixes, type QuickFix } from "./fixes.js";
export { moveSetting } from "./moves.js";
export { fixAll } from "./fix-all.js";
export { compareEnvironments, platformRequest } from "./platform-request.js";
export { type HoverOptions } from "./explain.js";
export { hoverAt } from "./hover.js";
export { definitionAt, referencesAt } from "./navigation.js";
export { fileMoveEdits, renameAt, renameProblem } from "./rename.js";
export { generatedFiles, generatedForTable, tableAtCursor, type Generated } from "./preview.js";
export { referenceAt, type ProblemEntry, type ReferenceEntry } from "./reference.js";
export { projectSymbols, type ProjectSymbol } from "./symbols.js";
export { referenceForDocs } from "./docs-entries.js";
export { inProject, openProject, projectFolderOf, type Project } from "./project.js";
export { positionAt, type Position } from "./yaml.js";
