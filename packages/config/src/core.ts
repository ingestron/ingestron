// `@ingestron/config/core`: everything except Node file access.
// Safe to use in browsers, VS Code webviews and tests.

// Files: where definitions are read from, and the size limits.
export { defaultLimits, memoryFiles, type FileSource, type Limits } from "./files/index.js";

// Kinds: the document kinds a project may hold, and their editor schemas.
export {
  defineKind,
  toEditorSchema,
  type JsonSchema,
  type KindDefinition,
  type KindOptions,
} from "./kinds/index.js";

// Loading: a project from its files, and the manifest's schema.
export { manifestSchema, resolveProject, type LoadOptions, type LoadResult } from "./load/index.js";

// Resolving: documents, references and secrets.
export {
  isSecretReference,
  type DefinitionDocument,
  type EnvvarReference,
  type Project,
  type SecretReference,
} from "./resolve/index.js";

// Validating: values left unset by `${envvar:…}`.
export { withoutUnsetEnvvars, type UnsetEnvvarFailure } from "./validate/index.js";

// Diagnostics: problems, their fixes, and how they are printed.
export {
  applyEdits,
  fixEdits,
  formatDiagnostics,
  type AnyDiagnostic,
  type Diagnostic,
  type DiagnosticCode,
  type Fix,
  type FixEdit,
  type Location,
  type Severity,
  type TextEdit,
} from "./diagnostics/index.js";

// Patterns: the rule `imports` matches paths by, for other places that take file patterns.
export { matchesImport } from "./internal/index.js";
