// `@ingestron/config/core`: everything except Node file access.
// Safe to use in browsers, VS Code webviews and tests.

export { defineKind } from "./kinds/kinds.js";
export type { JsonSchema, KindDefinition, KindOptions } from "./kinds/kinds.js";
export { resolveProject } from "./load/load.js";
export type { LoadOptions, LoadResult } from "./load/load.js";
export type { EnvvarReference, Project } from "./resolve/project.js";
export type { DefinitionDocument } from "./resolve/documents.js";
export { memoryFiles } from "./files/files.js";
export type { FileSource } from "./files/files.js";
export { formatDiagnostics } from "./diagnostics/diagnostics.js";
export { applyEdits, fixEdits } from "./diagnostics/fixes.js";
export type { TextEdit } from "./diagnostics/fixes.js";
export type {
  AnyDiagnostic,
  Diagnostic,
  DiagnosticCode,
  Fix,
  FixEdit,
  Location,
  Severity,
} from "./diagnostics/diagnostics.js";
export { defaultLimits } from "./files/limits.js";
export type { Limits } from "./files/limits.js";
export { manifestSchema } from "./load/manifest.js";
export { toEditorSchema } from "./kinds/editor-schema.js";
export { isSecretReference } from "./resolve/resolve-string.js";
export { withoutUnsetEnvvars } from "./validate/unset-references.js";
export type { UnsetEnvvarFailure } from "./validate/unset-references.js";
export type { SecretReference } from "./resolve/resolve-string.js";
