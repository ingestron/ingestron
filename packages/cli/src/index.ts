// Public API of @ingestron/cli: run the command line in-process.
import { formatDiagnostics } from "@ingestron/config";
import * as core from "@ingestron/core";
import { packLoadProblem } from "@ingestron/definitions";
import {
  compare,
  draftContract,
  draftFromMetadata,
  generate,
  init,
  request,
  source,
  standard,
  writeSchemas,
} from "./commands/index.js";
import { readArgs, usage, type Io, type Options } from "./terminal/index.js";

// The command's arguments and options, as help lists them.
export { commands, flags } from "./terminal/index.js";
export type { Io } from "./terminal/index.js";

/** What each command runs. */
const handlers: Record<Options["command"], (options: Options, io: Io) => number> = {
  plan: generate,
  apply: generate,
  check: generate,
  compare,
  contract: (options, io) =>
    options.fromMetadata ? draftFromMetadata(options, io) : draftContract(options, io),
  request,
  schemas: writeSchemas,
  init,
  standard,
  source,
};

/**
 * Runs `ingestron` with `args` and returns the exit code: 0 success, 1
 * problems in the definitions or the output folder, 2 a usage mistake or a pack
 * that cannot be loaded (`PACK_LOAD`, printed in place of running the command).
 * @example
 * process.exitCode = run(process.argv.slice(2), { cwd: process.cwd(), write: (text) => process.stdout.write(text) });
 * @public
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
  return handlers[options.command](options, io);
}
