// The diagnostics module: what the rest of the package uses.
export {
  error,
  formatDiagnostics,
  hasErrors,
  information,
  warning,
  type AnyDiagnostic,
  type Diagnostic,
  type DiagnosticCode,
  type Fix,
  type FixEdit,
  type Location,
  type Severity,
} from "./diagnostics.js";
export { applyEdits, fixEdits, type TextEdit } from "./fixes.js";
