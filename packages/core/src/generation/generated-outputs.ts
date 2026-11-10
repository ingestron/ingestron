// Every output folder as plan builds it, writing nothing, with what resolving
// and building found: for an editor to preview the files and show the problems.
import { formatDiagnostics, type AnyDiagnostic, type FileSource } from "@ingestron/config";
import { packLoadProblem, type Pack, type SuppliedValue } from "@ingestron/definitions";
import { generateAll, type Generated } from "./build-outputs.js";
import { packs } from "../packs/index.js";
import { reportsText } from "./report-text.js";
import type { Report } from "./resolve-environments.js";

export type { Report } from "./resolve-environments.js";

/**
 * One output folder, as plan writes it under the output folder.
 * @public
 */
export interface GeneratedOutput {
  /** The pack's id, or `products` for the passports. */
  name: string;
  /** The folder under the output folder, with `/` between its parts, such as `adf`. */
  folder: string;
  /** The environments it covers, in project.yaml's order. */
  targets: string[];
  /**
   * Whether each target's files are in a folder of its own, named after it, such as
   * `dev/run.sql`: true for a pack that builds one environment at a time, and for the passports.
   */
  byEnvironment: boolean;
  /** Each file's text, by its path in the folder, with `/` between its parts. */
  files: Record<string, string>;
  /**
   * For a pack that builds environments together: each variable whose value the deploying
   * pipeline supplies, and the names the files take it as, such as `BUNDLE_VAR_landing`.
   */
  deployValues?: SuppliedValue[];
}

/**
 * What {@link generatedOutputs} reads besides the files.
 * @public
 */
export interface GeneratedOutputsOptions {
  /** The variables to read, as the host's environment; default `process.env`. */
  envvars?: Readonly<Record<string, string | undefined>>;
  /** The packs a standard may name; default the CLI's own. */
  packs?: readonly Pack[];
}

/**
 * What plan would write, and what it found first.
 * @public
 */
export interface GeneratedOutputs {
  /** Whether every environment resolved and every pack built its files. */
  ok: boolean;
  /** The output folders, in the standard's order, then the passports; none unless `ok`. */
  outputs: GeneratedOutput[];
  /** What resolving each environment found, one report for each, named after it. */
  environmentReports: Report[];
  /** What each pack that builds environments together reported, such as `PACK_NOTICE` warnings. */
  packReports: Report[];
  /** The `PACK_LOAD` error when a pack cannot be loaded: then nothing is resolved or built. */
  refused?: AnyDiagnostic;
  /**
   * The environments resolved for deploy, known before resolving: those not local when the
   * standard names a pack that builds environments together (spec/cli/outputs.md,
   * section 1). Their variables are read only when deploying, even when generating fails.
   */
  deployed: string[];
  /**
   * The reports as plan prints them before planning: each environment's problems, then each
   * pack's problems or warnings, then the warnings not applied on this platform under their
   * heading, then the count of accepted warnings. Empty when there are none.
   */
  text: string;
}

/**
 * Resolves every environment and builds every output folder, as `ingestron plan` does,
 * and writes nothing. Variables come from `options.envvars` (default the host's
 * environment) and the project's `.env` files; packs from `options.packs` (default the
 * CLI's). A pack that cannot be loaded gives `refused` in place of throwing.
 * @example
 * const { outputs } = generatedOutputs(nodeFiles("definitions"));
 * for (const { folder, files } of outputs) console.log(folder, Object.keys(files));
 * @public
 */
export function generatedOutputs(
  files: FileSource,
  options: GeneratedOutputsOptions = {},
): GeneratedOutputs {
  const available = options.packs ?? packs;
  return outputsOf(available, () => generateAll(files, available, options.envvars ?? process.env));
}

/**
 * The refusal when one of `available` cannot be loaded, else what `generate` gives, as
 * {@link generatedOutputs} returns it. `generate` is not called for a refusal.
 */
export function outputsOf(available: readonly Pack[], generate: () => Generated): GeneratedOutputs {
  const refused = packLoadProblem(available);
  if (refused) {
    const text = `${formatDiagnostics([refused])}\n`;
    const nothing = { outputs: [], environmentReports: [], packReports: [], deployed: [] };
    return { ok: false, ...nothing, refused, text };
  }
  const generated = generate();
  const outputs = generated.outputs.map((output) => ({
    name: output.name,
    folder: output.folder,
    targets: output.targets,
    byEnvironment: output.byEnvironment,
    files: output.files,
    ...(output.deployValues && { deployValues: output.deployValues }),
  }));
  const text = reportsText(generated.environmentReports, generated.packReports);
  const deployed = generated.together
    ? generated.environmentReports
        .map((report) => report.name)
        .filter((name) => !generated.local.includes(name))
    : [];
  return {
    ok: generated.ok,
    outputs,
    deployed,
    environmentReports: generated.environmentReports,
    packReports: generated.packReports,
    text,
  };
}
