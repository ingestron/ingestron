// plan, apply and check: definitions → every environment resolved → one output
// folder per pack → the output folder (spec/cli/outputs.md).
import { relative, resolve, sep } from "node:path";
import { formatDiagnostics, nodeFiles } from "@ingestron/config";
import type { Pack } from "@ingestron/definitions";
import {
  applyPlan,
  formatPlan,
  manifestFile,
  nodeFolder,
  planGeneration,
  type OutputFolder,
  type Plan,
} from "@ingestron/generate";
import type { Options } from "./args.js";
import { buildOutputs } from "./build-outputs.js";
import type { Io } from "./io.js";
import { extraFiles, generatedFolders } from "./outputs.js";
import { packs } from "./packs.js";
import { resolveEnvironments, type Report } from "./resolve-environments.js";

interface Planned {
  name: string;
  targets: string[];
  folder: OutputFolder;
  plan: Plan;
  /** The output folder, absolute. */
  root: string;
}

/**
 * Runs plan, apply or check for every environment together. Returns the exit code.
 * `available` are the packs a standard may name; tests give stand-ins.
 */
export function generate(options: Options, io: Io, available: readonly Pack[] = packs): number {
  const definitions = resolve(io.cwd, options.definitions);
  const resolution = resolveEnvironments(nodeFiles(definitions), available, process.env);
  printReports(io, resolution.reports);
  if (!resolution.ok) return 1;
  const built = buildOutputs(resolution.environments, available);
  printReports(io, built.reports);
  if (!built.ok) return 1;
  const out = resolve(io.cwd, options.out);
  const planned = built.outputs.map(({ name, folder, targets, files }): Planned => {
    const root = resolve(out, ...folder.split("/"));
    const output = nodeFolder(root);
    return { name, targets, folder: output, plan: planGeneration(output, files), root };
  });
  const roots = planned.map((item) => item.root);
  const done = planned.filter((item) => finish(options, io, item, roots)).map(({ name }) => name);
  const notDone = planned.filter(({ name }) => !done.includes(name)).map(({ name }) => name);
  const retired = generatedFolders(out).filter((folder) => !roots.includes(folder));
  for (const folder of retired)
    io.write(
      `${shown(io, folder)}: no longer generated. Delete the folder, or delete its ${manifestFile} to keep it as your own.\n`,
    );
  if (options.command === "apply") summarise(io, done, notDone);
  return notDone.length > 0 || (options.command === "check" && retired.length > 0) ? 1 : 0;
}

/** Each environment's or pack's problems, or its warnings, before anything is planned. */
function printReports(io: Io, reports: readonly Report[]): void {
  for (const { name, failed, diagnostics } of reports) {
    if (!failed && diagnostics.length === 0) continue;
    const heading = failed ? "the definitions have problems" : "warnings";
    io.write(`${name}: ${heading}\n${formatDiagnostics(diagnostics)}\n`);
  }
}

/** A folder relative to the working folder, with `/` between its parts. */
function shown(io: Io, folder: string): string {
  return relative(io.cwd, folder).split(sep).join("/");
}

/** After apply, when some output folders were written and others not, says which. */
function summarise(io: Io, done: string[], notDone: string[]): void {
  if (done.length > 0 && notDone.length > 0)
    io.write(`Applied: ${done.join(", ")}. Not applied: ${notDone.join(", ")}.\n`);
}

/**
 * Prints the plan and, for apply, writes it. True when this output folder
 * succeeded. check also fails on files in the folder that were not
 * generated, unless --allow-extra; `roots` are every output folder, so one
 * inside another is not counted as extra.
 */
function finish(options: Options, io: Io, planned: Planned, roots: string[]): boolean {
  const { name, targets, folder, plan, root } = planned;
  if (options.command === "check") return check(options, io, planned, roots);
  io.write(`${name} → ${shown(io, root)} (${targets.join(", ")})\n`);
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
