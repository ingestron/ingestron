// ingestron compare: prints what differs between two environments.
import { resolve } from "node:path";
import { nodeFiles } from "@ingestron/config";
import type { Options } from "./args.js";
import { compareEnvironments } from "@ingestron/core";
import { environmentsToGenerate } from "@ingestron/core";
import type { Io } from "./io.js";

/** Prints the comparison of the two environments given, else the project's first two. */
export function compare(options: Options, io: Io): number {
  const definitions = resolve(io.cwd, options.definitions);
  const [a, b, ...more] = environmentsToGenerate(definitions, options.environments);
  if (!a || !b || (more.length > 0 && options.environments.length > 0)) {
    io.write(
      "compare needs two environments: name them with --env, or declare two in project.yaml.\n",
    );
    return 2;
  }
  const text = compareEnvironments(nodeFiles(definitions), a, b);
  io.write(text);
  return text.includes("the definitions have problems") ? 1 : 0;
}
