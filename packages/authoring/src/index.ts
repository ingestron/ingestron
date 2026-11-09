// Public API of @ingestron/authoring: what an editor needs to help write an
// Ingestron project, as plain functions over the project's files. The VS Code
// extension adapts these to its API; another editor can do the same.

// The project an open file belongs to, and positions in YAML.
export {
  inProject,
  openProject,
  positionAt,
  projectFolderOf,
  type Position,
  type Project,
} from "./project/index.js";

// Problems in the definitions.
export { problems, type Problem } from "./diagnostics/index.js";

// Completion, quick fixes, fixing everything at once, and moving a setting.
export {
  completionsAt,
  fixAll,
  moveSetting,
  quickFixes,
  type QuickFix,
  type Suggestion,
} from "./assist/index.js";

// Hover: what a key or value means, and where it is documented.
export { hoverAt, type HoverOptions } from "./hover/index.js";

// Navigation: definitions, references, renaming and symbols.
export {
  definitionAt,
  fileMoveEdits,
  projectSymbols,
  referencesAt,
  renameAt,
  renameProblem,
  type ProjectSymbol,
} from "./navigation/index.js";

// The generated files: previews, comparing environments and the platform request.
export {
  compareEnvironments,
  generatedFiles,
  generatedForTable,
  platformRequest,
  tableAtCursor,
  type Generated,
} from "./generation/index.js";

// Code lenses and inline annotations.
export {
  annotationsIn,
  generatedLenses,
  type Annotation,
  type GeneratedLens,
} from "./annotations/index.js";

// The settings reference, as the editor and the documentation show it.
export {
  referenceAt,
  referenceForDocs,
  type ProblemEntry,
  type ReferenceEntry,
} from "./reference/index.js";

// Links into the documentation.
export { codeDocs, docsLinks, docsUrl } from "./links/index.js";
