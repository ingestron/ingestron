// Public API of @ingestron/cli: run the command line in-process.
import { formatDiagnostics } from "@ingestron/config";
import { packLoadProblem } from "@ingestron/definitions";
import { readArgs, usage } from "./args.js";
export { commands, flags } from "./args.js";
import { generate } from "./generate.js";
import { init } from "./init.js";
import type { Io } from "./io.js";
import { compare } from "./compare.js";
import { request } from "./request.js";
import { draftContract } from "./sample-contract.js";
import { packs } from "./packs.js";
import { writeSchemas } from "./schemas.js";

export type { Io } from "./io.js";
export { packs } from "./packs.js";
export { nameProblem, projectId } from "./scaffold.js";
export {
  generatedOutputs,
  type GeneratedOutput,
  type GeneratedOutputs,
  type GeneratedOutputsOptions,
  type Report,
} from "./generated-outputs.js";
export { platformRequest } from "./request.js";
export { compareEnvironments } from "./compare.js";
export { contractFromSample } from "./sample-contract.js";
export {
  listSamples,
  readSample,
  sampleFacts,
  templatesFolder,
  type Sample,
  type SampleFacts,
} from "./samples.js";
export {
  projectSources,
  projectRoutes,
  type ProjectSource,
  type ProjectRoute,
} from "./project-choices.js";
export { projectRecipe, type ProjectRecipe } from "./project-recipes.js";
export { builtInTemplates, parseTemplate, templateSchema, type Template } from "./templates.js";

/**
 * Runs `ingestron` with `args` and returns the exit code: 0 success, 1
 * problems in the definitions or the output folder, 2 a usage mistake or a pack
 * that cannot be loaded (`PACK_LOAD`, printed in place of running the command).
 * @example
 * process.exitCode = run(process.argv.slice(2), { cwd: process.cwd(), write: (text) => process.stdout.write(text) });
 */
export function run(args: string[], io: Io): number {
  const options = readArgs(args);
  if (options === "help") {
    io.write(usage);
    return 0;
  }
  if ("mistake" in options) {
    io.write(`${options.mistake}\n\n${usage}`);
    return 2;
  }
  const refused = packLoadProblem(packs);
  if (refused) {
    io.write(`${formatDiagnostics([refused])}\n`);
    return 2;
  }
  if (options.command === "init") return init(options, io);
  if (options.command === "request") return request(options, io);
  if (options.command === "compare") return compare(options, io);
  if (options.command === "contract") return draftContract(options, io);
  return options.command === "schemas" ? writeSchemas(options, io) : generate(options, io);
}
