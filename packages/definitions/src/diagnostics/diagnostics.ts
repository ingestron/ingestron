// Diagnostics in the same shape as @ingestron/config's, so one formatter
// prints problems from loading and from resolving alike.
import type { AnyDiagnostic, DefinitionDocument, Fix } from "@ingestron/config";
import { keepOnce, subjectOf } from "./keep-once.js";
import { notAppliedBook, type NotApplied, type NotAppliedDetail } from "./not-applied.js";

/**
 * Every code this package reports. Each is explained in codes.ts.
 * @public
 */
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
  | "SETTING_MOVED"
  | "PLATFORM_FIELD_MOVED"
  | "INTENT_CONFLICT"
  | "NOT_APPLIED"
  | "PREVIEW_FEATURE"
  | "BAD_SETTING"
  | "METHOD_CHECK"
  | "PACK_CHECK"
  | "UNKNOWN_LAYER"
  | "DUPLICATE_LAYER"
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
  | "REPLACE_ME"
  | "RUNS_ON"
  | "RUNS_ON_SKIPPED"
  | "SETTINGS_UNUSED"
  | "TRANSFORM_COLUMNS"
  | "TRANSFORM_CODE"
  | "LAYER_RESPONSIBILITY"
  | "QUARANTINE_UNUSED"
  | "CLEANSE_COLUMN"
  | "CLEANSE_TYPE"
  | "DEDUPLICATE_KEY"
  | "DEDUPLICATE_MODE"
  | "TIMEZONE_NAME"
  | "TIMEZONE_SOURCE"
  | "ACCEPT_CODE"
  | "ACCEPT_UNUSED"
  | "PRODUCT_CONTRACT_UNUSED"
  | "PRODUCT_NOT_BUILT"
  | "PRODUCT_CONTRACT_SHARED"
  | "DUPLICATE_PRODUCT"
  | "PRODUCT_ID"
  | "PRODUCT_INCOMPLETE"
  | "COLUMN_UNCLASSIFIED"
  | "CLASSIFICATION_UNKNOWN"
  | "SENSITIVE_ACCESS"
  | "ROLE_ACCESS"
  | "MASK_TYPE"
  | "FILTER_MATCH"
  | "FILTER_MULTIPLE"
  | "MASK_NEEDS_RUN_AS"
  | "MASK_FUNCTIONS"
  | "POLICY_LIMIT"
  | "POLICY_PRINCIPALS"
  | "DEPLOY_VALUE"
  | "ENVIRONMENTS_DIFFER"
  | "ARM_PARAMETERS"
  | "SECRET_NAME_DIFFERS"
  | "PACK_NOTICE"
  | "PACK_LOAD"
  | "SOURCE_METADATA_DUPLICATE"
  | "SOURCE_OBJECT_AMBIGUOUS"
  | "TABLE_NO_COLUMNS"
  | "CONTRACT_NEEDED";

/**
 * What a warning is about, so it can be told apart from another with the same code
 * (specification section 1.2): the table, and for `NOT_APPLIED` and `CAPABILITY_OFF` the
 * feature, such as a rule kind, an action, a contract field path or a capability's id.
 * @example { table: "orders", feature: "pattern" }
 * @public
 */
export interface DiagnosticSubject {
  /** The name of the table the warning is about; absent when it is about several or none. */
  table?: string;
  /** The feature that is not applied, or the capability that is off. */
  feature?: string;
}

/**
 * A problem found while loading or resolving, in `@ingestron/config`'s shape, with what a
 * warning from resolving is about. Errors and loading's warnings have no subject.
 * @public
 */
export type Diagnostic = AnyDiagnostic & {
  /** What the warning is about (specification section 1.2). */
  subject?: DiagnosticSubject;
};

/** Where a value was written: a document and a JSON Pointer into it. */
export interface Source {
  document: DefinitionDocument;
  pointer: string;
}

/** Collects problems; resolution continues so that all are found in one run. */
export interface Reporter {
  readonly diagnostics: Diagnostic[];
  error(code: DefinitionCode, message: string, at?: Source, hint?: string, fixes?: Fix[]): void;
  /** Worth knowing, but the project still resolves; `subject` says what it is about. */
  warning(
    code: DefinitionCode,
    message: string,
    at?: Source,
    hint?: string,
    fixes?: Fix[],
    subject?: DiagnosticSubject,
    detail?: NotAppliedDetail,
  ): void;
  /**
   * Each `NOT_APPLIED` feature reported about the table, before warnings about several tables
   * are merged (specification section 11.7): what the model's `notApplied` holds.
   */
  notAppliedOf(table: string): NotApplied[];
  /**
   * Records a feature not applied on the table whose warning is reported once for several
   * tables without a table, such as one at the standard.
   */
  noteNotApplied(table: string, feature: string, detail: NotAppliedDetail): void;
  /** True once any error, not a warning, was reported. */
  failed(): boolean;
  /** True once a problem was left out because it sits at a value not known yet. */
  leftOut(): boolean;
  /** Records that something was not checked because it is not known yet, as a problem left out. */
  leaveOut(): void;
}

/**
 * A new, empty reporter. A problem written once on a flow is found for each
 * of its tables, so an identical diagnostic is kept only once, and one that
 * differs only in its subject's table is about several tables: it is kept once,
 * without the table. A problem that `unknown` names, such as one at text holding
 * an unset reference, is left out.
 */
export function createReporter(
  start: readonly AnyDiagnostic[] = [],
  unknown: (at: Source, code: DefinitionCode, severity: "error" | "warning") => boolean = () =>
    false,
): Reporter {
  const diagnostics: Diagnostic[] = [...start];
  const seen = new Map<string, Diagnostic>();
  const unapplied = notAppliedBook();
  let leftOut = false;
  const report = (
    severity: "error" | "warning",
    ...[code, message, at, hint, fixes, subject, detail]: Parameters<Reporter["warning"]>
  ) => {
    if (at && unknown(at, code, severity)) {
      leftOut = true;
      return;
    }
    if (code === "NOT_APPLIED") unapplied.record(subject, detail);
    const diagnostic = diagnosticOf(severity, code, message, at, hint, fixes);
    keepOnce(
      seen,
      diagnostics,
      diagnostic,
      severity === "warning" ? subjectOf(subject) : undefined,
    );
  };
  return {
    diagnostics,
    error: (code, message, at, hint, fixes) => report("error", code, message, at, hint, fixes),
    warning: (...args) => report("warning", ...args),
    notAppliedOf: unapplied.of,
    noteNotApplied: (table, feature, detail) => unapplied.record({ table, feature }, detail),
    failed: () => diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    leftOut: () => leftOut,
    leaveOut: () => {
      leftOut = true;
    },
  };
}

/**
 * The reporter, with each warning about the table: `table` is added to its subject.
 * Errors are reported as they are.
 */
export function aboutTable(reporter: Reporter, table: string): Reporter {
  return {
    get diagnostics() {
      return reporter.diagnostics;
    },
    error: (...args) => reporter.error(...args),
    warning: (code, message, at, hint, fixes, subject, detail) =>
      reporter.warning(code, message, at, hint, fixes, { table, ...subject }, detail),
    notAppliedOf: (name) => reporter.notAppliedOf(name),
    noteNotApplied: (...args) => reporter.noteNotApplied(...args),
    failed: () => reporter.failed(),
    leftOut: () => reporter.leftOut(),
    leaveOut: () => reporter.leaveOut(),
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
