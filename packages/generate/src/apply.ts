// Applying: writes a clean plan under the folder's lock, all or nothing.
import type { Entry, OutputFolder } from "./folder.js";
import { manifestText } from "./manifest.js";
import { manifestFile } from "./paths.js";
import { seenOf, type Plan } from "./plan.js";
import { problem, type Problem } from "./problems.js";

/**
 * The outcome of applying a plan.
 * @example
 * const result = applyPlan(folder, plan);
 * if (!result.ok) console.error(result.problems.map((p) => p.message).join("\n"));
 */
export interface ApplyResult {
  ok: boolean;
  problems: Problem[];
}

/**
 * Applies a clean plan: checks nothing changed since planning, writes and
 * deletes files, then writes the manifest. On any failure every file is put
 * back as it was.
 * @example
 * const plan = planGeneration(folder, wanted);
 * if (plan.clean) applyPlan(folder, plan);
 */
export function applyPlan(folder: OutputFolder, plan: Plan): ApplyResult {
  if (!plan.clean) {
    const message = "The plan has conflicts or problems; resolve them and plan again.";
    return failed([problem("PLAN_HAS_CONFLICTS", message)]);
  }
  if (!folder.lock()) {
    const message =
      "Another generation is writing to this folder. If none is, delete .generated.lock.";
    return failed([problem("LOCKED", message)]);
  }
  try {
    const changed = changedSincePlan(folder, plan);
    return changed.length > 0 ? failed(changed) : writeAll(folder, plan);
  } finally {
    folder.unlock();
  }
}

function failed(problems: Problem[]): ApplyResult {
  return { ok: false, problems };
}

function changedSincePlan(folder: OutputFolder, plan: Plan): Problem[] {
  const expected = [...plan.changes.map(({ path, seen }) => ({ path, seen }))];
  expected.push({ path: manifestFile, seen: plan.manifestSeen });
  return expected
    .filter(({ path, seen }) => seenOf(folder.read(path)) !== seen)
    .map(({ path }) =>
      problem("CHANGED_SINCE_PLAN", `"${path}" changed after planning; plan again.`, path),
    );
}

/** Makes every change, remembering how to undo each one. */
function writeAll(folder: OutputFolder, plan: Plan): ApplyResult {
  const undo: (() => void)[] = [];
  const step = (path: string, action: () => void): void => {
    const before = folder.read(path);
    action();
    undo.push(() => restore(folder, path, before));
  };
  let current = manifestFile;
  try {
    for (const { path, change } of plan.changes) {
      current = path;
      if (change === "create" || change === "update")
        step(path, () => folder.write(path, plan.wanted.get(path) ?? ""));
      if (change === "delete") step(path, () => folder.remove(path));
    }
    current = manifestFile;
    step(manifestFile, () => folder.write(manifestFile, manifestText(plan.wanted)));
    return { ok: true, problems: [] };
  } catch (cause) {
    const outcome = undoAll(undo) ? "Nothing was changed." : "Some files could not be put back.";
    const message = `Could not write "${current}": ${messageOf(cause)}. ${outcome}`;
    return failed([problem("WRITE_FAILED", message, current)]);
  }
}

/** Runs every undo step, newest first, even when one fails. True when all succeeded. */
function undoAll(undo: (() => void)[]): boolean {
  let complete = true;
  for (const action of undo.reverse()) {
    try {
      action();
    } catch {
      complete = false;
    }
  }
  return complete;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function restore(folder: OutputFolder, path: string, before: Entry): void {
  if (before.kind === "file") folder.write(path, before.content);
  else folder.remove(path);
}
