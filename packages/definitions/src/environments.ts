// Building every environment together (specification section 2.1): what a pack
// returns when it folds its targets into one artefact, and the diagnostics for
// what it could not fold.
import type { AnyDiagnostic } from "@ingestron/config";
import type { DefinitionCode } from "./diagnostics.js";

/** The codes a pack may report from `buildEnvironments`, each documented in the code help. */
export type EnvironmentsCode = Extract<
  DefinitionCode,
  "ENVIRONMENTS_DIFFER" | "DEPLOY_VALUE" | "ARM_PARAMETERS" | "SECRET_NAME_DIFFERS"
>;

/**
 * What stops one artefact covering every target, or is worth knowing: `ENVIRONMENTS_DIFFER`
 * for a difference that is not a value, `DEPLOY_VALUE` for a deploy-time value the
 * platform cannot take where it is used, `ARM_PARAMETERS` for too many ARM parameters,
 * and the warning `SECRET_NAME_DIFFERS`. Located at the definition that causes it.
 * @example
 * { code: "ENVIRONMENTS_DIFFER", severity: "error", message: 'Table "orders" is built in dev but not in prod.', file: "flows/sales.yaml" }
 */
export interface EnvironmentsProblem {
  /** The diagnostic's code. */
  code: EnvironmentsCode;
  /** An error stops the files being written; a warning does not. */
  severity: "error" | "warning";
  /** One or more sentences, as the pack's specification gives them. */
  message: string;
  /** In place of the code's hint, when the problem has its own. */
  hint?: string;
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
 * stopped them covering every target. With any error, the files are not written.
 */
export interface EnvironmentsBuild {
  /** Path → text, relative to the pack's output folder. */
  files: Record<string, string>;
  /** In the order they first appear in the models, in target order; unused ones left out. */
  deployValues: SuppliedValue[];
  /** What the files cannot cover, each reported with {@link environmentsDiagnostics}. */
  problems: EnvironmentsProblem[];
}

const hints: Record<EnvironmentsCode, string> = {
  ENVIRONMENTS_DIFFER:
    "Environments may differ only in values, such as names, paths and hosts; make the rest the same in every environment.",
  DEPLOY_VALUE:
    "Write this value in project.yaml, per environment; keep ${envvar:…} for values the deploying pipeline supplies, such as hosts, paths and accounts.",
  ARM_PARAMETERS:
    "Make fewer values differ between environments, or split the definitions into more than one factory.",
  SECRET_NAME_DIFFERS:
    "Give the secret the same name in every environment's Key Vault, so that only the vault differs.",
};

/** The hint of every `DEPLOY_VALUE`, from resolution or from a pack, unless it has its own. */
export const deployValueHint = hints.DEPLOY_VALUE;

/**
 * The diagnostics for a pack's problems, each at its file and line (line 1 when the pack
 * gives none), column 1, with its own hint or else its code's.
 * @example
 * const diagnostics = environmentsDiagnostics(pack.buildEnvironments(models).problems);
 */
export function environmentsDiagnostics(problems: readonly EnvironmentsProblem[]): AnyDiagnostic[] {
  return problems.map((problem) => ({
    code: problem.code,
    severity: problem.severity,
    message: problem.message,
    hint: problem.hint ?? hints[problem.code],
    location: { file: problem.file, line: problem.line ?? 1, column: 1 },
  }));
}
