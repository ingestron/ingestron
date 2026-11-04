// Diagnostics in the same shape as @ingestron/config's, so one formatter
// prints problems from loading and from resolving alike.
import type { AnyDiagnostic, DefinitionDocument, Fix } from "@ingestron/config";

/** Every code this package reports. Each is explained in codes.ts. */
export type DefinitionCode =
  | "NO_STANDARD"
  | "MANY_STANDARDS"
  | "WRONG_PACK"
  | "PACK_VERSION"
  | "UNKNOWN_PACK"
  | "METHOD_CONFLICT"
  | "MANY_PLATFORMS"
  | "UNKNOWN_METHOD"
  | "WRONG_ACTION"
  | "METHOD_NOT_ALLOWED"
  | "CONNECTOR_NOT_SUPPORTED"
  | "CONNECTIVITY_NOT_SUPPORTED"
  | "HANDOVER"
  | "FIXED_SETTING"
  | "BAD_SETTING"
  | "METHOD_CHECK"
  | "PACK_CHECK"
  | "UNKNOWN_LAYER"
  | "BAD_PATTERN"
  | "BAD_NAME"
  | "DUPLICATE_NAME"
  | "DUPLICATE_TABLE"
  | "UNKNOWN_INPUT"
  | "UNKNOWN_CODE_VALUE"
  | "INPUT_CYCLE"
  | "CONTRACT_TABLE"
  | "CONTRACT_FIELD_UNUSED"
  | "QUALITY_RULE_NOT_CHECKED"
  | "CAPABILITY_OFF"
  | "PLACEHOLDER_NOT_REPLACED"
  | "RUNS_ON"
  | "RUNS_ON_SKIPPED"
  | "SETTINGS_UNUSED"
  | "TRANSFORM_COLUMNS"
  | "PRODUCT_CONTRACT_UNUSED"
  | "PRODUCT_NOT_BUILT"
  | "PRODUCT_CONTRACT_SHARED"
  | "DUPLICATE_PRODUCT"
  | "PRODUCT_ID"
  | "PRODUCT_INCOMPLETE"
  | "COLUMN_UNCLASSIFIED"
  | "CLASSIFICATION_UNKNOWN"
  | "SENSITIVE_ACCESS"
  | "DEPLOY_VALUE"
  | "ENVIRONMENTS_DIFFER"
  | "ARM_PARAMETERS"
  | "SECRET_NAME_DIFFERS";

/** Where a value was written: a document and a JSON Pointer into it. */
export interface Source {
  document: DefinitionDocument;
  pointer: string;
}

/** Collects problems; resolution continues so that all are found in one run. */
export interface Reporter {
  readonly diagnostics: AnyDiagnostic[];
  error(code: DefinitionCode, message: string, at?: Source, hint?: string, fixes?: Fix[]): void;
  /** Worth knowing, but the project still resolves. */
  warning(code: DefinitionCode, message: string, at?: Source, hint?: string, fixes?: Fix[]): void;
  /** True once any error, not a warning, was reported. */
  failed(): boolean;
  /** True once a problem was left out because it sits at a value not known yet. */
  leftOut(): boolean;
  /** Records that something was not checked because it is not known yet, as a problem left out. */
  leaveOut(): void;
}

/**
 * A new, empty reporter. A problem written once on a flow is found for each
 * of its tables, so an identical diagnostic is kept only once. A problem that
 * `unknown` names, such as one at text holding an unset reference, is left out.
 */
export function createReporter(
  start: readonly AnyDiagnostic[] = [],
  unknown: (at: Source, code: DefinitionCode, severity: "error" | "warning") => boolean = () =>
    false,
): Reporter {
  const diagnostics: AnyDiagnostic[] = [...start];
  const seen = new Set<string>();
  let leftOut = false;
  const report = (
    severity: "error" | "warning",
    code: DefinitionCode,
    message: string,
    at?: Source,
    hint?: string,
    fixes?: Fix[],
  ) => {
    if (at && unknown(at, code, severity)) {
      leftOut = true;
      return;
    }
    const diagnostic = diagnosticOf(severity, code, message, at, hint, fixes);
    const key = JSON.stringify(diagnostic);
    if (seen.has(key)) return;
    seen.add(key);
    diagnostics.push(diagnostic);
  };
  return {
    diagnostics,
    error: (...args) => report("error", ...args),
    warning: (code, message, at, hint, fixes) => report("warning", code, message, at, hint, fixes),
    failed: () => diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    leftOut: () => leftOut,
    leaveOut: () => {
      leftOut = true;
    },
  };
}

function diagnosticOf(
  severity: "error" | "warning",
  code: DefinitionCode,
  message: string,
  at?: Source,
  hint?: string,
  fixes?: Fix[],
): AnyDiagnostic {
  const location = at?.document.locate(at.pointer);
  return {
    code,
    severity,
    message,
    ...(hint && { hint }),
    ...(location && { location }),
    ...(fixes && fixes.length > 0 && { fixes }),
  };
}
