// Building every environment together (specification section 2.1): what a pack
// returns when it folds its targets into one artefact, and the diagnostics for
// what it could not fold.
import type { AnyDiagnostic } from "@ingestron/config";
import type { DefinitionCode } from "./diagnostics.js";

/**
 * What stops one artefact covering every target: `ENVIRONMENTS_DIFFER` for a
 * difference that is not a value, `DEPLOY_VALUE` for a deploy-time value the
 * platform cannot take where it is used. Located at the definition that causes it.
 * @example
 * { code: "ENVIRONMENTS_DIFFER", message: 'Table "orders" is built in dev but not in prod.', file: "flows/sales.yaml" }
 */
export interface EnvironmentsProblem {
  /** The diagnostic's code; its hint comes with it. */
  code: "ENVIRONMENTS_DIFFER" | "DEPLOY_VALUE";
  /** One or more sentences, as the pack's specification gives them. */
  message: string;
  /** The definition's file, relative to the project. */
  file: string;
  /** Its line, when the pack knows it. */
  line?: number;
}

/** What a deploy-time value is called in the files, for the pipeline that deploys them. */
export interface SuppliedValue {
  /** The variable's name, as in `${envvar:NAME}`. */
  name: string;
  /** Each name the deploying pipeline supplies it under, such as `BUNDLE_VAR_landing`. */
  suppliedAs: string[];
}

/**
 * The files for every target at once, with the deploy-time values they take and what
 * stopped them covering every target. With any problem, the files are not written.
 */
export interface EnvironmentsBuild {
  /** Path → text, relative to the pack's output folder. */
  files: Record<string, string>;
  /** In the order of the models' `deployValues`; a value the files do not use is left out. */
  deployValues: SuppliedValue[];
  /** What the files cannot cover, each reported with {@link environmentsDiagnostics}. */
  problems: EnvironmentsProblem[];
}

const hints: Record<EnvironmentsProblem["code"], string> = {
  ENVIRONMENTS_DIFFER:
    "Environments may differ only in values, such as names, paths and hosts; make the rest the same in every environment.",
  DEPLOY_VALUE:
    "Write this value in project.yaml, per environment; keep ${envvar:…} for values the deploying pipeline supplies, such as hosts, paths and accounts.",
};

/** The hint of every `DEPLOY_VALUE`, from resolution or from a pack. */
export const deployValueHint = hints.DEPLOY_VALUE;

/**
 * The diagnostics for a pack's problems, each an error at its file and line (line 1
 * when the pack gives none), column 1.
 * @example
 * const diagnostics = environmentsDiagnostics(pack.buildEnvironments(models).problems);
 */
export function environmentsDiagnostics(problems: readonly EnvironmentsProblem[]): AnyDiagnostic[] {
  return problems.map((problem) => ({
    code: problem.code satisfies DefinitionCode,
    severity: "error",
    message: problem.message,
    hint: hints[problem.code],
    location: { file: problem.file, line: problem.line ?? 1, column: 1 },
  }));
}
