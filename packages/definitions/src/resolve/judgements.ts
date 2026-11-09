// What the packs that apply a table's intent say about each value (specification
// section 11.5): not applied, applied through a feature in preview, or nothing to say.
import type { Context } from "../context/index.js";
import { holdsUnsetEnvvar } from "../diagnostics/index.js";
import { isRecord } from "../internal/index.js";
import {
  intentPaths,
  intentUseOf,
  type FeatureStatus,
  type Intent,
  type IntentUse,
} from "../intent/index.js";
import type { Method, ResolvedTable } from "../pack/index.js";
import { leaves, valueAtIntentPath } from "./intent-values.js";
import { judgeOf } from "./judging-step.js";

/** What the judging pack says about a value, when it says anything a project hears. */
export type Outcome =
  { kind: "not-applied"; reason: string } | { kind: "preview"; status: FeatureStatus };

/** One value of a table's intent, the pack of the step that judges it, and what it says. */
export interface Judgement {
  path: string;
  /** The value as coverage keys it; absent for a path whose value is any text. */
  value?: string;
  /** The value as messages write it. */
  text: string;
  pack: string;
  outcome: Outcome;
}

/** A table's step with its method. */
interface JudgingStep {
  id: string;
  pack: string;
  method: Method;
}

/**
 * Each value of the table's intent, other than a pack's default, that its judging step's
 * method or pack does not apply or applies through a preview feature. A table that holds an
 * unset reference is not judged, except when resolving for deploy (section 1.1).
 */
export function judgementsOf(context: Context, table: ResolvedTable): Judgement[] {
  if (!context.deployTime && holdsUnsetEnvvar(context.project, table)) return [];
  const steps = stepsOf(context, table);
  const judged = (path: string) => {
    const origin = table.intentOrigins[path];
    return origin !== undefined && origin.layer !== "pack";
  };
  return Object.keys(intentPaths)
    .filter(judged)
    .flatMap((path) =>
      judgedValues(table.intent, path).flatMap((item) => {
        const judge = judgeOf(path, steps, item.value);
        const outcome = judge && outcomeOf(context, judge, path, item);
        return judge && outcome ? [{ path, ...item, pack: judge.pack, outcome }] : [];
      }),
    );
}

function stepsOf(context: Context, table: ResolvedTable): JudgingStep[] {
  return [table.ingest, table.transform, table.store, table.serve].flatMap((step) => {
    const method = step && context.pack.methods[step.method];
    return step && method ? [{ id: step.method, pack: step.pack, method }] : [];
  });
}

/**
 * The values judged at a path: each item of a list on its own, audit entries by their value,
 * and only the values `intentPaths` lists; a path whose value is any text, once, on the path.
 */
function judgedValues(intent: Intent, path: string): { value?: string; text: string }[] {
  const listed = intentPaths[path] ?? [];
  const raw = valueAtIntentPath(intent, path);
  if (raw === undefined) return [];
  if (listed.includes("*")) return [{ text: typeof raw === "string" ? raw : JSON.stringify(raw) }];
  return coverageValues(intent, path)
    .filter((value) => listed.includes(value))
    .map((value) => ({ value, text: value }));
}

/** The values at a path as coverage names them: a list's items, an audit entry's value, as text. */
function coverageValues(intent: Intent, path: string): string[] {
  const raw = valueAtIntentPath(intent, path);
  if (raw === undefined) return [];
  return (Array.isArray(raw) ? raw : [raw]).map((item: unknown) =>
    isRecord(item) && typeof item.value === "string" ? item.value : String(item),
  );
}

/**
 * The method's own entry decides; else the pack's entry when it is not `used`; else a
 * method whose aliases give other values of the path but not this one; else the pack's entry.
 */
function outcomeOf(
  context: Context,
  judge: JudgingStep,
  path: string,
  item: { value?: string; text: string },
): Outcome | undefined {
  const own = intentUseOf(judge.method, path, item.value);
  if (own) return outcomeOfUse(own);
  const pack = context.packs.find((candidate) => candidate.id === judge.pack);
  const use = pack && intentUseOf(pack, path, item.value);
  if (use && use.use !== "used") return outcomeOfUse(use);
  if (lacksSetting(judge.method, path, item.value ?? item.text))
    return { kind: "not-applied", reason: `"${judge.id}" has no setting for it.` };
  return use && outcomeOfUse(use);
}

function outcomeOfUse(use: IntentUse): Outcome | undefined {
  if (use.use === "used")
    return use.status?.level === "preview" ? { kind: "preview", status: use.status } : undefined;
  return use.use === "elsewhere" ? undefined : { kind: "not-applied", reason: use.reason };
}

/**
 * True when the method has an alias whose values give the path, and no alias stands for
 * this value. A `path` alias at the path, or above it, stands for every value.
 */
function lacksSetting(method: Method, path: string, value: string): boolean {
  const aliases = Object.values(method.aliases ?? {});
  const passes = aliases.some(
    (alias) => "path" in alias && (alias.path === path || path.startsWith(`${alias.path}.`)),
  );
  if (passes) return false;
  const touching = aliases
    .flatMap((alias) => ("values" in alias ? Object.values(alias.values) : []))
    .filter((fragment) => leaves(fragment).includes(path));
  return (
    touching.length > 0 &&
    !touching.some((fragment) => coverageValues(fragment, path).includes(value))
  );
}
