// Public API of @ingestron/authoring: what an editor needs to help write an
// Ingestron project, starting from a ProjectSnapshot. The VS Code
// extension adapts these to its API; another editor can do the same.

// A project as the editor sees it at one moment, with everything an editor asks of it.
export { ProjectSnapshot } from "./snapshot/index.js";

// The project an open file belongs to, and positions in YAML.
export { inProject, positionAt, projectFolderOf, type Position } from "./project/index.js";

// What the snapshot's methods give.
export { type Problem } from "./diagnostics/index.js";
export { type QuickFix, type Suggestion } from "./assist/index.js";
export { replaceMeHelp, type HoverOptions, type ReplaceMeHelp } from "./hover/index.js";
export { type ProjectSymbol } from "./navigation/index.js";
export { type Annotation, type GeneratedLens } from "./annotations/index.js";
export { type ProblemEntry, type ReferenceEntry } from "./reference/index.js";

// The generated files: the ones a table under the cursor is generated into.
export { generatedForTable, tableAtCursor, type Generated } from "./generation/index.js";

// Links into the documentation.
export { codeDocs, docsLinks, docsUrl } from "./links/index.js";
