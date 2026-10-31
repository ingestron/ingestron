// `@ingestron/config/core`: everything except Node file access.
// Safe to use in browsers, VS Code webviews and tests.

export { defineKind } from "./kinds.js";
export type { JsonSchema, KindDefinition, KindOptions } from "./kinds.js";
export { resolveProject } from "./load.js";
export type { LoadOptions, LoadResult } from "./load.js";
export type { Project } from "./project.js";
export type { DefinitionDocument } from "./documents.js";
export { memoryFiles } from "./files.js";
export type { FileSource } from "./files.js";
export { formatDiagnostics } from "./diagnostics.js";
export { applyEdits, fixEdits } from "./fixes.js";
export type { TextEdit } from "./fixes.js";
export type {
  AnyDiagnostic,
  Diagnostic,
  DiagnosticCode,
  Fix,
  FixEdit,
  Location,
  Severity,
} from "./diagnostics.js";
export { defaultLimits } from "./limits.js";
export type { Limits } from "./limits.js";
export { manifestSchema } from "./manifest.js";
export { toEditorSchema } from "./editor-schema.js";
export { isSecretReference } from "./resolve-string.js";
export type { SecretReference } from "./resolve-string.js";
