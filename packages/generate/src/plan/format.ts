// Turns a plan into text for a terminal or a review comment.
import type { Change, Plan } from "./plan.js";

/** Options for {@link formatPlan}. */
export interface FormatOptions {
  /** Show the line diff under each update. Default: false. */
  diffs?: boolean;
}

const indent = " ".repeat(10);
const order = ["create", "update", "delete", "adopt", "forget", "unchanged", "conflict"] as const;

/**
 * One line per change (unchanged files are only counted), an explanation
 * under each conflict and problem, and a summary.
 * @example
 * console.log(formatPlan(plan, { diffs: true }));
 */
export function formatPlan(plan: Plan, options: FormatOptions = {}): string {
  const lines: string[] = [];
  for (const change of plan.changes) {
    if (change.change === "unchanged") continue;
    lines.push(`${change.change.padEnd(10)}${change.path}`);
    const detail = change.change === "conflict" ? explain(change, plan) : diffOf(change, options);
    if (detail) lines.push(...detail.split("\n").map((line) => indent + line));
  }
  for (const { code, path, message } of plan.problems) {
    lines.push(`${"problem".padEnd(10)}${path ?? ""}${path ? "  " : ""}${code}`, indent + message);
  }
  lines.push("", summary(plan));
  return lines.join("\n");
}

function diffOf(change: Change, options: FormatOptions): string | undefined {
  return options.diffs ? change.diff : undefined;
}

function explain(change: Change, plan: Plan): string {
  if (change.reason === "NOT_A_FILE")
    return "Is a folder or a link; only plain files are generated.";
  if (change.reason === "NOT_GENERATED") {
    return "Exists but was not generated. Move or delete it, or stop generating it.";
  }
  if (!plan.wanted.has(change.path)) {
    return "Changed by hand and no longer generated. Delete it, or move it out of this folder.";
  }
  return "Changed by hand since it was generated. Move the change into the definitions, or delete the file to generate it again.";
}

function summary(plan: Plan): string {
  const counts = order
    .map((kind) => [kind, plan.changes.filter((change) => change.change === kind).length] as const)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${count} ${kind}`);
  const files = `${plan.changes.length} ${plan.changes.length === 1 ? "file" : "files"}`;
  const head = counts.length > 0 ? `${files}: ${counts.join(", ")}.` : `${files}.`;
  return `${head} ${verdict(plan)}`;
}

function verdict(plan: Plan): string {
  if (plan.problems.length > 0) return "Fix the problems before applying.";
  if (!plan.clean) return "Resolve the conflicts before applying.";
  return plan.upToDate ? "Up to date." : "Ready to apply.";
}
