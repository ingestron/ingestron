// plan, apply and check: definitions → files → the output folder.
import { join, relative, resolve, sep } from "node:path";
import { formatDiagnostics } from "@ingestron/config";
import { loadDefinitions, type ResolvedModel } from "@ingestron/definitions";
import {
  applyPlan,
  formatPlan,
  manifestFile,
  nodeFolder,
  planGeneration,
  type OutputFolder,
  type Plan,
} from "@ingestron/generate";
import { packs } from "./packs.js";
import type { Options } from "./args.js";
import { environmentsToGenerate } from "./environments.js";
import { extraFiles, generatedFolders } from "./outputs.js";
import type { Io } from "./io.js";

interface Planned {
  name: string;
  folder: OutputFolder;
  plan: Plan;
  /** The output folder, absolute. */
  root: string;
  /** The output folder, relative to the working folder. */
  output: string;
}

/** Runs plan, apply or check for each environment. Returns the exit code. */
export function generate(options: Options, io: Io): number {
  const definitions = resolve(io.cwd, options.definitions);
  const planned: Planned[] = [];
  const unresolved: string[] = [];
  for (const environment of environmentsToGenerate(definitions, options.environments)) {
    const outputs = planEnvironment(options, io, definitions, environment);
    if (!outputs) unresolved.push(environment ?? "default");
    planned.push(...(outputs ?? []));
  }
  const roots = planned.map((item) => item.root);
  const done = planned.filter((item) => finish(options, io, item, roots)).map(({ name }) => name);
  const notDone = [
    ...planned.filter(({ name }) => !done.includes(name)).map(({ name }) => name),
    ...unresolved,
  ];
  const retired = retiredFolders(options, resolve(io.cwd, options.out), roots, unresolved);
  for (const folder of retired)
    io.write(
      `${relative(io.cwd, folder)}: no longer generated. Delete the folder, or delete its ${manifestFile} to keep it as your own.\n`,
    );
  if (options.command === "apply") summarise(io, done, notDone);
  return notDone.length > 0 || (options.command === "check" && retired.length > 0) ? 1 : 0;
}

/** After apply, when some output folders were written and others not, says which. */
function summarise(io: Io, done: string[], notDone: string[]): void {
  if (done.length > 0 && notDone.length > 0)
    io.write(`Applied: ${done.join(", ")}. Not applied: ${notDone.join(", ")}.\n`);
}

/**
 * Folders under the output folder that hold a manifest but that the
 * definitions no longer generate. With --env, only those environments'
 * folders are looked at; nor are those of an environment that failed to load.
 */
function retiredFolders(
  options: Options,
  out: string,
  current: string[],
  unresolved: string[],
): string[] {
  const within = (folder: string, root: string) => folder === root || folder.startsWith(root + sep);
  const looked =
    options.environments.length > 0
      ? options.environments.map((environment) => join(out, environment))
      : [out];
  const skipped = unresolved.map((environment) => join(out, environment));
  return looked
    .flatMap(generatedFolders)
    .filter((folder) => !current.includes(folder))
    .filter((folder) => !skipped.some((root) => within(folder, root)));
}

/**
 * One plan per pack the standard names. With one pack the output folder is
 * `<out>/<environment>`; with several, each pack gets `<out>/<environment>/<pack>`.
 */
function planEnvironment(
  options: Options,
  io: Io,
  definitions: string,
  environment: string | undefined,
): Planned[] | undefined {
  const name = environment ?? "default";
  const result = loadDefinitions(definitions, { packs, environment, envvars: process.env });
  if (!result.model) {
    io.write(`${name}: the definitions have problems\n${formatDiagnostics(result.diagnostics)}\n`);
    return undefined;
  }
  if (result.diagnostics.length > 0)
    io.write(`${name}: warnings\n${formatDiagnostics(result.diagnostics)}\n`);
  return generatedOutputs(result.model, name).map(({ label, files }) => {
    const output = resolve(io.cwd, options.out, label);
    const folder = nodeFolder(output);
    const plan = planGeneration(folder, files);
    return { name: label, folder, plan, root: output, output: relative(io.cwd, output) };
  });
}

/**
 * The files each pack the standard names generates for one environment. The
 * label is the output sub-folder: `<environment>`, or `<environment>/<pack>`
 * with several packs.
 */
export function generatedOutputs(
  model: ResolvedModel,
  environment: string,
): { pack: string; label: string; files: Record<string, string> }[] {
  const used = packs.filter((pack) => model.standard.packs.includes(`${pack.id}@${pack.version}`));
  return used.map((pack) => ({
    pack: pack.id,
    label: used.length > 1 ? `${environment}/${pack.id}` : environment,
    files: pack.build(model),
  }));
}

/**
 * Prints the plan and, for apply, writes it. True when this output folder
 * succeeded. check also fails on files in the folder that were not
 * generated, unless --allow-extra; `roots` are every output folder, so one
 * inside another is not counted as extra.
 */
function finish(options: Options, io: Io, planned: Planned, roots: string[]): boolean {
  const { name, folder, plan, output } = planned;
  if (options.command === "check") return check(options, io, planned, roots);
  io.write(`${name} → ${output}\n`);
  io.write(`${formatPlan(plan, { diffs: options.diffs })}\n`);
  if (options.command === "plan" || !plan.clean) return plan.clean;
  if (plan.upToDate) return true;
  const result = applyPlan(folder, plan);
  io.write(
    result.ok ? "Applied.\n" : `${result.problems.map((problem) => problem.message).join("\n")}\n`,
  );
  return result.ok;
}

/** check for one output folder: up to date, and nothing in it that was not generated. */
function check(options: Options, io: Io, { name, plan, root }: Planned, roots: string[]): boolean {
  const known = new Set(plan.changes.map((change) => change.path));
  const extra = options.allowExtra ? [] : extraFiles(root, known, roots);
  io.write(
    plan.upToDate ? `${name}: up to date\n` : `${name}: not up to date\n${formatPlan(plan)}\n`,
  );
  for (const path of extra) io.write(`${name}: not generated  ${path}\n`);
  if (extra.length > 0)
    io.write(
      "Move files that were not generated out of the output folder, or check with --allow-extra.\n",
    );
  return plan.upToDate && extra.length === 0;
}
