// ingestron contract <sample>: writes a draft contract from a sample file.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import type { Options } from "./args.js";
import type { Io } from "./io.js";
import { contractFromSample, objectName } from "@ingestron/core";

/** Writes contracts/<name>.yaml from the sample. Returns the exit code. */
export function draftContract(options: Options, io: Io): number {
  const sample = resolve(io.cwd, options.sample ?? "");
  if (!options.sample || !existsSync(sample)) {
    io.write(`contract needs a sample file: ingestron contract <file.csv|file.json>\n`);
    return 2;
  }
  const name = options.init.name ?? objectName(sample);
  const target = join(resolve(io.cwd, options.definitions), "contracts", `${name}.yaml`);
  const shown = relative(io.cwd, target);
  if (existsSync(target)) {
    io.write(`${shown} already exists; nothing written.\n`);
    return 1;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contractFromSample(readFileSync(sample, "utf8"), basename(sample), name));
  io.write(`Wrote ${shown}. Review the types, then add keys, required columns and descriptions.\n`);
  return 0;
}
