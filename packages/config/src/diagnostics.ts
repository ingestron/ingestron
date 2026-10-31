/** A position in a project file. Lines and columns start at 1. */
export interface Location {
  /** Path relative to the project root, using "/". */
  file: string;
  line: number;
  column: number;
}

/** Whether a diagnostic stops the load (`error`) or is advice (`warning`). */
export type Severity = "error" | "warning";

/**
 * Every problem the loader can report. Each code is described, with an
 * example and a fix, in docs/reference/diagnostics.md.
 */
export type DiagnosticCode =
  | "YAML_SYNTAX"
  | "UNSAFE_KEY"
  | "MISSING_FILE"
  | "FILE_TOO_LARGE"
  | "PATH_OUTSIDE_PROJECT"
  | "INCLUDE_CYCLE"
  | "INCLUDE_TOO_DEEP"
  | "INCLUDE_LIMIT"
  | "ALIAS_LIMIT"
  | "BAD_POINTER"
  | "UNCLOSED_REFERENCE"
  | "UNKNOWN_REFERENCE"
  | "BAD_ARGUMENT"
  | "UNKNOWN_VALUE"
  | "VALUES_SELF_REFERENCE"
  | "NO_ENVIRONMENT"
  | "UNKNOWN_ENVIRONMENT"
  | "ENVVAR_MISSING"
  | "NOT_TEXT"
  | "SECRET_IN_TEXT"
  | "MISSING_HEADER"
  | "UNKNOWN_KIND"
  | "DUPLICATE_ID"
  | "SCHEMA"
  | "BROKEN_LINK"
  | "NO_MATCH";

/** One problem found while loading a project. */
export interface Diagnostic {
  code: DiagnosticCode;
  severity: Severity;
  message: string;
  /** A suggested fix, when there is one. */
  hint?: string;
  /** Where the problem is, when it can be attributed to a place in a file. */
  location?: Location;
  /** Changes that each solve the problem, for a person to choose from. */
  fixes?: Fix[];
}

/** A change that solves a problem: edits applied together (specification section 6.1). */
export interface Fix {
  title: string;
  edits: FixEdit[];
}

/**
 * One edit of a fix, at a JSON Pointer into a project file's document: `set`
 * writes a value there (a pointer ending in `/-` adds to a list), `rename`
 * renames the key the pointer ends at, `remove` removes the key or list item
 * with its value, and any mapping or list that leaves empty.
 */
export type FixEdit = { file: string; pointer: string } & (
  { set: unknown } | { rename: string } | { remove: true }
);

/**
 * Creates an error diagnostic. Shorthand used throughout the loader.
 * @example
 * error("MISSING_FILE", "File not found: a.yaml", { file: "b.yaml", line: 3, column: 7 })
 */
export function error(
  code: DiagnosticCode,
  message: string,
  location?: Location,
  hint?: string,
): Diagnostic {
  return { code, severity: "error", message, location, hint };
}

/** Creates a warning diagnostic: worth knowing, but the load still succeeds. */
export function warning(
  code: DiagnosticCode,
  message: string,
  location?: Location,
  hint?: string,
): Diagnostic {
  return { code, severity: "warning", message, location, hint };
}

/** True when the list contains at least one error (warnings do not count). */
export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

/**
 * Formats diagnostics for a terminal or CI log, one block per diagnostic:
 *
 * ```text
 * orders.yaml:4:6  error  UNKNOWN_REFERENCE
 *   "${bundle.target}" is not a definition reference.
 *   To pass it to the output unchanged, write "$${bundle.target}".
 * ```
 */
export function formatDiagnostics(diagnostics: readonly AnyDiagnostic[]): string {
  return diagnostics.map(formatDiagnostic).join("\n");
}

/**
 * A diagnostic whose code may come from another package that reports in the
 * same shape, so one formatter prints them all.
 */
export type AnyDiagnostic = Omit<Diagnostic, "code"> & { code: string };

function formatDiagnostic(diagnostic: AnyDiagnostic): string {
  const where = diagnostic.location
    ? `${diagnostic.location.file}:${diagnostic.location.line}:${diagnostic.location.column}`
    : "(project)";
  const lines = [`${where}  ${diagnostic.severity}  ${diagnostic.code}`, diagnostic.message];
  if (diagnostic.hint) lines.push(diagnostic.hint);
  const [fix] = diagnostic.fixes ?? [];
  if (fix) lines.push(`Fix: ${fix.title}.`);
  // Every line of the message and hint is indented, so a multi-line example stays under its problem.
  return [
    lines[0],
    ...lines.slice(1).flatMap((text) => text!.split("\n").map((line) => `  ${line}`)),
  ].join("\n");
}
