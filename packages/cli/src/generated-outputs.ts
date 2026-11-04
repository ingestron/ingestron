// Every output folder as plan builds it, writing nothing, with what resolving
// and building found: for an editor to preview the files and show the problems.
import type { FileSource } from "@ingestron/config";
import { generateAll } from "./build-outputs.js";
import { packs } from "./packs.js";
import { environmentReportsText, packReportsText } from "./reports.js";
import type { Report } from "./resolve-environments.js";

export type { Report } from "./resolve-environments.js";

/** One output folder, as plan writes it under the output folder. */
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
}

/** What plan would write, and what it found first. */
export interface GeneratedOutputs {
  /** Whether every environment resolved and every pack built its files. */
  ok: boolean;
  /** The output folders, in the standard's order, then the passports; none unless `ok`. */
  outputs: GeneratedOutput[];
  /** What resolving each environment found, one report for each, named after it. */
  environmentReports: Report[];
  /** What each pack that builds environments together reported, such as `PACK_NOTICE` warnings. */
  packReports: Report[];
  /**
   * The reports as plan prints them before planning: each environment's problems, then each
   * pack's problems or warnings. Empty when there are none.
   */
  text: string;
}

/**
 * Resolves every environment and builds every output folder with the CLI's packs, as
 * `ingestron plan` does, and writes nothing. Variables come from the host's environment
 * and the project's `.env` files.
 * @example
 * const { outputs } = generatedOutputs(nodeFiles("definitions"));
 * for (const { folder, files } of outputs) console.log(folder, Object.keys(files));
 */
export function generatedOutputs(files: FileSource): GeneratedOutputs {
  const generated = generateAll(files, packs, process.env);
  const outputs = generated.outputs.map(({ name, folder, targets, byEnvironment, files }) => ({
    name,
    folder,
    targets,
    byEnvironment,
    files,
  }));
  const text =
    environmentReportsText(generated.environmentReports) + packReportsText(generated.packReports);
  return {
    ok: generated.ok,
    outputs,
    environmentReports: generated.environmentReports,
    packReports: generated.packReports,
    text,
  };
}
