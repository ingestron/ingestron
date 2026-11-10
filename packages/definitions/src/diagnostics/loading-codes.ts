// What each problem found while loading files means, and how to fix it, in
// Ingestron's words. The codes are @ingestron/config's; every one has an entry.
import type { DiagnosticCode, Severity } from "@ingestron/config";

/**
 * When the problem is found, for grouping in the documentation.
 * @public
 */
export type LoadingStage = "Files and YAML" | "References" | "Environments and documents";

/**
 * Meaning and fix of every code reported while loading, by code.
 * @public
 */
export const loadingCodeHelp: Record<
  DiagnosticCode,
  { stage: LoadingStage; meaning: string; fix: string; severities: readonly Severity[] }
> = {
  YAML_SYNTAX: {
    stage: "Files and YAML",
    meaning:
      "The file is not valid YAML: bad indentation, a duplicate key, or more than one document.",
    fix: "Fix it at the reported line.",
    severities: ["error"],
  },
  UNSAFE_KEY: {
    stage: "Files and YAML",
    meaning: "A key is `__proto__`, `constructor` or `prototype`, or is not plain text.",
    fix: "Rename the key.",
    severities: ["error"],
  },
  MISSING_FILE: {
    stage: "Files and YAML",
    meaning: "A file named in `${file:\u2026}`, or `project.yaml`, does not exist in the project.",
    fix: "Correct the path; it is relative to the file that has the reference.",
    severities: ["error"],
  },
  FILE_TOO_LARGE: {
    stage: "Files and YAML",
    meaning: "A file is larger than 10 MiB.",
    fix: "Split it.",
    severities: ["error"],
  },
  PATH_OUTSIDE_PROJECT: {
    stage: "Files and YAML",
    meaning: "A `${file:\u2026}` path or an import pattern would leave the project folder.",
    fix: "Move the file into the project.",
    severities: ["error"],
  },
  NO_MATCH: {
    stage: "Files and YAML",
    meaning: "An import pattern in `project.yaml` matched no files. A warning; loading continues.",
    fix: "Check the pattern; it is relative to `project.yaml`.",
    severities: ["warning"],
  },
  INCLUDE_CYCLE: {
    stage: "Files and YAML",
    meaning: "Files include each other in a loop. The message shows the chain.",
    fix: "Remove one of the `${file:\u2026}` references.",
    severities: ["error"],
  },
  INCLUDE_TOO_DEEP: {
    stage: "Files and YAML",
    meaning: "More than 32 `${file:\u2026}` includes inside one another.",
    fix: "Include fewer levels.",
    severities: ["error"],
  },
  INCLUDE_LIMIT: {
    stage: "Files and YAML",
    meaning: "More than 1,000 `${file:\u2026}` references were followed in one load.",
    fix: "Include shared files fewer times.",
    severities: ["error"],
  },
  ALIAS_LIMIT: {
    stage: "Files and YAML",
    meaning: "More than 100 YAML alias expansions in one load.",
    fix: "Use fewer aliases, or move shared parts into a file.",
    severities: ["error"],
  },
  UNKNOWN_REFERENCE: {
    stage: "References",
    meaning: "A `${\u2026}` that is not a reference Ingestron knows.",
    fix: "Use `${values.\u2026}`, `${environment.name}`, `${project.id}`, `${file:\u2026}`, `${secret:\u2026}` or `${envvar:\u2026}`; write `$${\u2026}` to keep the text as it is.",
    severities: ["error"],
  },
  UNCLOSED_REFERENCE: {
    stage: "References",
    meaning: "A `${` without a closing `}`.",
    fix: "Add the `}`, or write `$${` if the text is literal.",
    severities: ["error"],
  },
  UNKNOWN_VALUE: {
    stage: "References",
    meaning: "A `${values.\u2026}` names a value that does not exist.",
    fix: "Add it to `values` in `project.yaml`; the hint lists the names that exist.",
    severities: ["error"],
  },
  VALUES_SELF_REFERENCE: {
    stage: "References",
    meaning: "A value in `project.yaml` uses `${values.\u2026}`.",
    fix: "Write the value out; values cannot refer to each other.",
    severities: ["error"],
  },
  BAD_POINTER: {
    stage: "References",
    meaning:
      "The `#\u2026` part of `${file:\u2026}` does not start with `/`, finds no value, or is on a file that is not YAML.",
    fix: "Correct the pointer, or remove it.",
    severities: ["error"],
  },
  BAD_ARGUMENT: {
    stage: "References",
    meaning: "A reference's argument is malformed, such as `${envvar:1BAD}`.",
    fix: "Use letters, digits and `_`, not starting with a digit.",
    severities: ["error"],
  },
  ENVVAR_MISSING: {
    stage: "References",
    meaning:
      "A `${envvar:\u2026}` names a variable that is unset or empty in the environment, `.env.<environment>` and `.env`.",
    fix: "Set the variable before running the command, or add it to `.env.<environment>` or `.env`.",
    severities: ["error", "information"],
  },
  ENV_FILE_LINE: {
    stage: "Files and YAML",
    meaning:
      "A line in `.env` or `.env.<environment>` is not a setting, so it is ignored. The message names the file and line, never the value.",
    fix: "Write `NAME=value`, close any quote, or start the line with `#` to make it a comment.",
    severities: ["warning"],
  },
  NOT_TEXT: {
    stage: "References",
    meaning: "A list, mapping or null is embedded in text.",
    fix: "Use it as a whole value, or refer to one item.",
    severities: ["error"],
  },
  SECRET_IN_TEXT: {
    stage: "References",
    meaning:
      "A `${secret:\u2026}` is embedded in text, which would put it into logs and generated files.",
    fix: "Use the secret as a whole value.",
    severities: ["error"],
  },
  UNKNOWN_ENVIRONMENT: {
    stage: "Environments and documents",
    meaning: "The environment, such as in `--env`, is not declared in `project.yaml`.",
    fix: "Check the spelling; the hint lists the declared environments.",
    severities: ["error"],
  },
  NO_ENVIRONMENT: {
    stage: "Environments and documents",
    meaning: "`${environment.name}` was used, but no environment was selected.",
    fix: "Declare `environments` in `project.yaml`.",
    severities: ["error"],
  },
  MISSING_HEADER: {
    stage: "Environments and documents",
    meaning: "A document lacks a text `apiVersion`, `kind` or `id`, or is empty.",
    fix: "Add the missing field.",
    severities: ["error"],
  },
  UNKNOWN_KIND: {
    stage: "Environments and documents",
    meaning: "The document's `kind` is not one Ingestron knows.",
    fix: "Use Standard, Platform, Connection, Flow or Transform.",
    severities: ["error"],
  },
  SCHEMA: {
    stage: "Environments and documents",
    meaning: "A field is unknown, missing or has the wrong type.",
    fix: "Compare with [Documents](/docs/reference/documents).",
    severities: ["error"],
  },
  DUPLICATE_ID: {
    stage: "Environments and documents",
    meaning: "Two documents of one kind have the same id.",
    fix: "Rename one.",
    severities: ["error"],
  },
  BROKEN_LINK: {
    stage: "Environments and documents",
    meaning: "A document names an id that no document of that kind has.",
    fix: "Check the spelling; the hint lists the ids that exist.",
    severities: ["error"],
  },
};
