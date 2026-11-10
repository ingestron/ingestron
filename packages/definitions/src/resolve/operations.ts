// The project-level intent (specification section 11.6): the operations policy and the
// quality results, which belong to no table. The tags the standard requires are checked
// here; the pack that runs the jobs judges `operations`, and each store step's pack judges
// each table's `quality.results`.
import type { Context } from "../context/index.js";
import type { Source } from "../diagnostics/index.js";
import { holdsUnsetEnvvar } from "../diagnostics/index.js";
import {
  intentUseOf,
  resolveOperations,
  type IntentUse,
  type ResolvedOperations,
} from "../intent/index.js";
import type { Method, PackInfo, ResolvedTable } from "../pack/index.js";
import { reportJudgement } from "./judge.js";
import { outcomeOfUse, type Judgement, type Outcome } from "./judgements.js";
import { qualityPlace } from "./table-quality.js";

/** The operations policy in effect: the standard's, with defaults, and what it fixes over it. */
export function operationsOf(context: Context): ResolvedOperations {
  const standard = context.standard.value;
  return resolveOperations(standard.operations, standard.fixed?.operations);
}

/** Reports what the project-level intent gets wrong: missing tags, and values no pack applies. */
export function checkOperations(context: Context, tables: ResolvedTable[]): void {
  checkRequiredTags(context, operationsOf(context).require_tags);
  judgeOperations(context);
  judgeQualityResults(context, tables);
}

/** `BAD_SETTING` at the Platform's tags for each tag the standard requires and the Platform lacks. */
function checkRequiredTags(context: Context, required: string[]): void {
  const tags = context.platform?.value.tags ?? {};
  const at: Source | undefined = context.platform && {
    document: context.platform,
    pointer: context.platform.value.tags ? "/tags" : "",
  };
  for (const tag of required.filter((tag) => !Object.hasOwn(tags, tag))) {
    context.reporter.error(
      "BAD_SETTING",
      `The standard requires the tag "${tag}" on every platform.`,
      at,
      "Add the tag to the Platform's tags.",
    );
  }
}

/** A value of the operations policy that differs from the default, to be judged. */
interface OperationsValue {
  path: string;
  value?: string;
  text: string;
  /** Where the standard wrote it. */
  pointer: string;
}

/**
 * Each value of the policy other than a default: the schedule when it is per flow, a trigger
 * other than `schedule`, retries, timeout and concurrency, and each alert other than `failure`.
 */
function setOperations(context: Context): OperationsValue[] {
  const standard = context.standard.value;
  const resolved = operationsOf(context);
  const pointer = (key: string) =>
    standard.fixed?.operations?.[key as keyof ResolvedOperations] === undefined
      ? `/operations/${key}`
      : `/fixed/operations/${key}`;
  const values: OperationsValue[] = [];
  const add = (key: string, value: string | undefined, text: string) =>
    values.push({
      path: `operations.${key}`,
      ...(value !== undefined && { value }),
      text,
      pointer: pointer(key),
    });
  if (resolved.schedule.per !== "project")
    add("schedule", resolved.schedule.per, resolved.schedule.per);
  if (resolved.trigger !== "schedule") add("trigger", resolved.trigger, resolved.trigger);
  if (resolved.retries) add("retries", undefined, JSON.stringify(resolved.retries));
  if (resolved.timeout !== undefined) add("timeout", undefined, resolved.timeout);
  for (const on of resolved.alerts.on.filter((on) => on !== "failure")) add("alerts", on, on);
  if (resolved.concurrency) add("concurrency", undefined, JSON.stringify(resolved.concurrency));
  return values;
}

/** True when the pack declares the path `operations`, or one below it, `used`. */
function runsJobs(pack: PackInfo): boolean {
  return Object.entries(pack.intent ?? {}).some(
    ([key, use]) => use.use === "used" && (key === "operations" || key.startsWith("operations.")),
  );
}

/**
 * Judges the policy against the first pack whose coverage declares any `operations` path used.
 * When none does, each value other than a default is `NOT_APPLIED`, naming the first pack.
 */
function judgeOperations(context: Context): void {
  const judge = context.packs.find(runsJobs);
  const pack = judge ?? context.packs[0];
  if (!pack) return;
  for (const item of setOperations(context)) {
    const at = { document: context.standard, pointer: item.pointer };
    const use = intentUseOf(pack, item.path, item.value);
    const outcome = judge ? use && outcomeOfUse(use) : unjudged(use);
    if (outcome) reportJudgement(context, { ...item, pack: pack.id, outcome }, at);
  }
}

/** With no pack running jobs, the first pack's reason; `elsewhere` stays silent. */
function unjudged(use: IntentUse | undefined): Outcome | undefined {
  if (use?.use === "elsewhere") return undefined;
  return { kind: "not-applied", reason: use && "reason" in use ? use.reason : noPack };
}

const noPack = "No pack of this standard runs jobs.";

/**
 * Judges `quality.results: true` of each table against the pack of its store step, where the
 * value was written, once for each place, pack and reason: the method's own entry decides, else
 * the pack's.
 */
function judgeQualityResults(context: Context, tables: ResolvedTable[]): void {
  const once = new Map<string, { judgement: Judgement; at: Source }>();
  for (const table of tables) {
    const at = qualityPlace(table, "results");
    if (table.quality?.results !== true || !at || !judgeable(context, table)) continue;
    const step = table.store!;
    const judgement = qualityJudgement(context, step.pack, context.pack.methods[step.method]);
    if (!judgement) continue;
    const where = at.document.locate(at.pointer);
    once.set(JSON.stringify([where.file, at.pointer, judgement.pack, judgement.outcome]), {
      judgement,
      at,
    });
  }
  for (const { judgement, at } of once.values()) reportJudgement(context, judgement, at);
}

/** A table with a store step, whose values are known. */
function judgeable(context: Context, table: ResolvedTable): boolean {
  return (
    table.store !== undefined && (context.deployTime || !holdsUnsetEnvvar(context.project, table))
  );
}

function qualityJudgement(
  context: Context,
  packId: string,
  method: Method | undefined,
): Judgement | undefined {
  const pack = context.packs.find((candidate) => candidate.id === packId);
  const use =
    (method && intentUseOf(method, "quality.results", "true")) ??
    (pack && intentUseOf(pack, "quality.results", "true"));
  const outcome = use && outcomeOfUse(use);
  return outcome && { path: "quality.results", value: "true", text: "true", pack: packId, outcome };
}
