// Public API of @ingestron/cli: run the command line in-process.
import { formatDiagnostics } from "@ingestron/config";
import * as core from "@ingestron/core";
import { packLoadProblem } from "@ingestron/definitions";
import { compare, draftContract, generate, init, request, writeSchemas } from "./commands/index.js";
import { readArgs, usage, type Io } from "./terminal/index.js";

// The command's arguments and options, as help lists them.
export { commands, flags } from "./terminal/index.js";
export type { Io } from "./terminal/index.js";

// Moved to @ingestron/core in 2.2. Each stays here, as the same value, until 3.0.

/** @deprecated Use `builtInTemplates` from `@ingestron/core`. Removed in 3.0. */
export const builtInTemplates: typeof core.builtInTemplates = core.builtInTemplates;
/** @deprecated Use `compareEnvironments` from `@ingestron/core`. Removed in 3.0. */
export const compareEnvironments: typeof core.compareEnvironments = core.compareEnvironments;
/** @deprecated Use `contractFromSample` from `@ingestron/core`. Removed in 3.0. */
export const contractFromSample: typeof core.contractFromSample = core.contractFromSample;
/** @deprecated Use `generatedOutputs` from `@ingestron/core`. Removed in 3.0. */
export const generatedOutputs: typeof core.generatedOutputs = core.generatedOutputs;
/** @deprecated Use `listSamples` from `@ingestron/core`. Removed in 3.0. */
export const listSamples: typeof core.listSamples = core.listSamples;
/** @deprecated Use `nameProblem` from `@ingestron/core`. Removed in 3.0. */
export const nameProblem: typeof core.nameProblem = core.nameProblem;
/** @deprecated Use `packs` from `@ingestron/core`. Removed in 3.0. */
export const packs: typeof core.packs = core.packs;
/** @deprecated Use `parseTemplate` from `@ingestron/core`. Removed in 3.0. */
export const parseTemplate: typeof core.parseTemplate = core.parseTemplate;
/** @deprecated Use `platformRequest` from `@ingestron/core`. Removed in 3.0. */
export const platformRequest: typeof core.platformRequest = core.platformRequest;
/** @deprecated Use `projectId` from `@ingestron/core`. Removed in 3.0. */
export const projectId: typeof core.projectId = core.projectId;
/** @deprecated Use `projectRecipe` from `@ingestron/core`. Removed in 3.0. */
export const projectRecipe: typeof core.projectRecipe = core.projectRecipe;
/** @deprecated Use `projectRoutes` from `@ingestron/core`. Removed in 3.0. */
export const projectRoutes: typeof core.projectRoutes = core.projectRoutes;
/** @deprecated Use `projectSources` from `@ingestron/core`. Removed in 3.0. */
export const projectSources: typeof core.projectSources = core.projectSources;
/** @deprecated Use `readSample` from `@ingestron/core`. Removed in 3.0. */
export const readSample: typeof core.readSample = core.readSample;
/** @deprecated Use `sampleFacts` from `@ingestron/core`. Removed in 3.0. */
export const sampleFacts: typeof core.sampleFacts = core.sampleFacts;
/** @deprecated Use `templateSchema` from `@ingestron/core`. Removed in 3.0. */
export const templateSchema: typeof core.templateSchema = core.templateSchema;
/** @deprecated Use `templatesFolder` from `@ingestron/core`. Removed in 3.0. */
export const templatesFolder: typeof core.templatesFolder = core.templatesFolder;
/** @deprecated Use `GeneratedOutput` from `@ingestron/core`. Removed in 3.0. */
export type GeneratedOutput = core.GeneratedOutput;
/** @deprecated Use `GeneratedOutputs` from `@ingestron/core`. Removed in 3.0. */
export type GeneratedOutputs = core.GeneratedOutputs;
/** @deprecated Use `GeneratedOutputsOptions` from `@ingestron/core`. Removed in 3.0. */
export type GeneratedOutputsOptions = core.GeneratedOutputsOptions;
/** @deprecated Use `ProjectRecipe` from `@ingestron/core`. Removed in 3.0. */
export type ProjectRecipe = core.ProjectRecipe;
/** @deprecated Use `ProjectRoute` from `@ingestron/core`. Removed in 3.0. */
export type ProjectRoute = core.ProjectRoute;
/** @deprecated Use `ProjectSource` from `@ingestron/core`. Removed in 3.0. */
export type ProjectSource = core.ProjectSource;
/** @deprecated Use `Report` from `@ingestron/core`. Removed in 3.0. */
export type Report = core.Report;
/** @deprecated Use `Sample` from `@ingestron/core`. Removed in 3.0. */
export type Sample = core.Sample;
/** @deprecated Use `SampleFacts` from `@ingestron/core`. Removed in 3.0. */
export type SampleFacts = core.SampleFacts;
/** @deprecated Use `Template` from `@ingestron/core`. Removed in 3.0. */
export type Template = core.Template;

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
  const refused = packLoadProblem(core.packs);
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
