// ingestron request: prints the request for each environment (spec/cli/request.md).
import { resolve } from "node:path";
import { nodeFiles } from "@ingestron/config";
import type { Options } from "./args.js";
import { generateAll } from "@ingestron/core";
import { environmentsToGenerate } from "@ingestron/core";
import type { Io } from "./io.js";
import { packs } from "@ingestron/core";
import { requestFor } from "@ingestron/core";

/** Prints the request for each environment. Returns the exit code: 1 when any has errors. */
export function request(options: Options, io: Io): number {
  const definitions = resolve(io.cwd, options.definitions);
  const files = nodeFiles(definitions);
  const generated = generateAll(files, packs, process.env);
  const requests = environmentsToGenerate(definitions, options.environments).map((environment) =>
    requestFor(files, environment, generated),
  );
  io.write(requests.map(({ text }) => text).join("\n"));
  return requests.some(({ resolved }) => !resolved) ? 1 : 0;
}
