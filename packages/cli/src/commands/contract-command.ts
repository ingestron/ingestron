// ingestron contract <sample>: writes a draft contract from a sample file.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import type { Options } from "../terminal/index.js";
import type { Io } from "../terminal/index.js";
import { nodeFiles } from "@ingestron/config";
import {
  contractFromSample,
  definitionImport,
  draftContracts,
  type ContractDraft,
} from "@ingestron/core";
import { writeStaged } from "./write-staged.js";
import { objectName } from "@ingestron/core/internal";

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
  const definitions = resolve(io.cwd, options.definitions);
  const text = contractFromSample(readFileSync(sample, "utf8"), basename(sample), name);
  const added = writeImported(definitions, `contracts/${name}.yaml`, text);
  io.write(`Wrote ${shown}. Review the types, then add keys, required columns and descriptions.\n`);
  if (added) io.write(`project.yaml now imports ${added}.\n`);
  return 0;
}

/**
 * Writes a new contract and, when no import matches it, project.yaml with the import that loads it
 * (spec/cli/projects.md, "The new file's import"), both together. Returns the entry added.
 */
function writeImported(definitions: string, path: string, text: string): string | undefined {
  const target = join(definitions, path);
  const imports = definitionImport(nodeFiles(definitions), path);
  if (!imports) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text, { flag: "wx" });
    return undefined;
  }
  writeStaged([
    { file: target, text },
    { file: join(definitions, "project.yaml"), text: imports.project },
  ]);
  return imports.added;
}

/** Writes a draft unless its file exists (never replacing one), and says which. */
function writeDraft(definitions: string, draft: ContractDraft, io: Io): void {
  let added: string | undefined;
  try {
    if (existsSync(join(definitions, draft.path)))
      throw Object.assign(new Error("exists"), { code: "EEXIST" });
    added = writeImported(definitions, draft.path, draft.text);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    io.write(`Skipped ${draft.path}: it already exists.\n`);
    return;
  }
  io.write(`Wrote ${draft.path}.\n`);
  if (added) io.write(`project.yaml now imports ${added}.\n`);
}

/**
 * contract --from-metadata: writes the draft of each table named, or of each table that needs a
 * contract, skipping a file that exists, and prints the line to add to each table. Returns the
 * exit code: 1 when any table could not be drafted.
 */
export function draftFromMetadata(options: Options, io: Io): number {
  const definitions = resolve(io.cwd, options.definitions);
  const { tables, needed } = options.fromMetadata!;
  const environment = options.environments[0];
  const { drafts, problems } = draftContracts(nodeFiles(definitions), {
    ...(needed ? { needed } : { tables }),
    ...(environment !== undefined && { environment }),
  });
  for (const draft of drafts) writeDraft(definitions, draft, io);
  for (const draft of drafts) io.write(`Add to ${draft.table}: contract: ${draft.id}\n`);
  for (const problem of problems) io.write(`${problem}\n`);
  if (needed && drafts.length + problems.length === 0)
    io.write("No table needs a contract drafted.\n");
  return problems.length > 0 ? 1 : 0;
}
