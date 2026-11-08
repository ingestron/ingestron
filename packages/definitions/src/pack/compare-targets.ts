// Comparing the targets of a pack that builds environments together (specification
// section 2.1): what differs in more than a value, with the standard messages, and
// every place where only a value differs, so that each pack folds the same way.
import type { EnvironmentsProblem } from "./environments.js";
import { checkDeployNames } from "./deploy-names.js";
import type { ResolvedModel, ResolvedTable } from "./model.js";

/** One place where the targets' values are not all the same. */
export interface TargetDifference {
  /** A JSON Pointer into the first target's model. */
  pointer: string;
  /** The value in each target that has one, by target name. */
  values: Record<string, unknown>;
}

/** What {@link compareTargets} finds. */
export interface TargetComparison {
  /** `ENVIRONMENTS_DIFFER` and `DEPLOY_VALUE` errors: what no parameter can express. */
  structural: EnvironmentsProblem[];
  /** Every other place where a value differs between targets. */
  differing: TargetDifference[];
}

/** The targets' models, by target name. */
export type Models = Readonly<Record<string, ResolvedModel>>;
const steps = ["ingest", "transform", "store", "serve"] as const;
/** Where a value was written or how a method was chosen: not values that reach files. */
const metadata = new Set(["origins", "chosenBy"]);

/**
 * Compares the targets' models, keyed by target name in project.yaml's order.
 * @example
 * const { structural, differing } = compareTargets({ dev: devModel, prod: prodModel });
 */
export function compareTargets(models: Readonly<Record<string, ResolvedModel>>): TargetComparison {
  const targets = Object.keys(models);
  const structural: EnvironmentsProblem[] = [];
  const differing: TargetDifference[] = [];
  const [first] = targets;
  if (first === undefined) return { structural, differing };
  for (const name of tableNames(models, targets))
    compareTable(models, targets, name, { structural, differing });
  const walk = { models, found: { structural, differing } };
  diffValues(
    "",
    byTarget(targets, (target) => rest(models[target]!)),
    walk,
  );
  return { structural: once(structural), differing };
}

/** The parts of a model compared as values, apart from its tables, compared by name. */
function rest(model: ResolvedModel): Omit<ResolvedModel, "tables" | "deployValues"> {
  const others: Partial<ResolvedModel> = { ...model };
  delete others.tables;
  delete others.deployValues;
  return others as Omit<ResolvedModel, "tables" | "deployValues">;
}

/** Every table name, in the order the targets first have it. */
function tableNames(models: Models, targets: string[]): string[] {
  const names = targets.flatMap(
    (target) => models[target]?.tables.map((table) => table.name) ?? [],
  );
  return [...new Set(names)];
}

function byTarget(targets: string[], value: (target: string) => unknown): Record<string, unknown> {
  return Object.fromEntries(targets.map((target) => [target, value(target)]));
}

/** What the comparison has found so far. */
export interface Found {
  structural: EnvironmentsProblem[];
  differing: TargetDifference[];
}

/** One table across the targets: whether each has it and its steps, then its values. */
function compareTable(models: Models, targets: string[], name: string, found: Found): void {
  const tableIn = (target: string) => models[target]?.tables.find((table) => table.name === name);
  const having = targets.filter((target) => tableIn(target));
  const sample = tableIn(having[0]!)!;
  if (having.length < targets.length) {
    found.structural.push(
      differ(
        `Table "${name}" is built in ${listOf(having)} but not in ${listOf(targets.filter((target) => !having.includes(target)))}.`,
        sample.origin.file,
      ),
    );
    return;
  }
  const tables = byTarget(targets, (target) => tableIn(target));
  if (!stepsMatch(targets, tables as Record<string, ResolvedTable>, found)) return;
  const index = models[targets[0]!]!.tables.indexOf(sample);
  diffValues(`/tables/${index}`, tables, { models, found });
}

/** True when every target has the same steps with the same methods; else reports why not. */
function stepsMatch(
  targets: string[],
  tables: Record<string, ResolvedTable>,
  found: Found,
): boolean {
  const first = tables[targets[0]!]!;
  let match = true;
  for (const step of steps) {
    const having = targets.filter((target) => tables[target]![step]);
    if (having.length > 0 && having.length < targets.length) {
      const without = targets.filter((target) => !having.includes(target));
      found.structural.push(
        differ(
          `Table "${first.name}" has a ${step} step in ${listOf(having)} but not in ${listOf(without)}.`,
          first.origin.file,
        ),
      );
      match = false;
    } else if (having.length > 0) match = methodsMatch(targets, tables, step, found) && match;
  }
  return match;
}

function methodsMatch(
  targets: string[],
  tables: Record<string, ResolvedTable>,
  step: (typeof steps)[number],
  found: Found,
): boolean {
  const [first, ...others] = targets as [string, ...string[]];
  const method = tables[first]![step]!.method;
  let match = true;
  for (const target of others) {
    const other = tables[target]![step]!;
    if (other.method === method) continue;
    const at = other.chosenBy.file ?? tables[target]!.origin.file;
    found.structural.push(
      differ(
        `Table "${tables[first]!.name}" uses "${method}" for ${step} in ${first} and "${other.method}" in ${target}.`,
        at,
        other.chosenBy.file ? other.chosenBy.line : undefined,
      ),
    );
    match = false;
  }
  return match;
}

/** The comparison in progress. */
export interface Walk {
  models: Models;
  found: Found;
}

/** Compares one place in every target, going into mappings and lists of the same length. */
function diffValues(pointer: string, values: Record<string, unknown>, walk: Walk): void {
  const present = Object.entries(values).filter(([, value]) => value !== undefined);
  const all = present.length === Object.keys(values).length;
  const inner = all ? childrenOf(present.map(([, value]) => value)) : undefined;
  if (inner) {
    for (const key of inner)
      diffValues(`${pointer}/${escape(key)}`, childValues(values, key), walk);
    return;
  }
  const texts = present.map(([, value]) => JSON.stringify(value));
  if (all && new Set(texts).size <= 1) return;
  const held = Object.fromEntries(present);
  walk.found.differing.push({ pointer, values: held });
  checkDeployNames(held, walk);
}

/** The keys to go into when every value is a mapping, or a list of the same length. */
function childrenOf(values: unknown[]): string[] | undefined {
  if (values.every((value) => Array.isArray(value))) {
    const lengths = new Set(values.map((value) => (value as unknown[]).length));
    return lengths.size === 1 ? Object.keys(values[0] as unknown[]) : undefined;
  }
  if (!values.every((value) => value !== null && typeof value === "object")) return undefined;
  const keys = values.flatMap((value) => Object.keys(value as object));
  return [...new Set(keys)].filter((key) => !metadata.has(key));
}

function childValues(values: Record<string, unknown>, key: string): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).map(([target, value]) => [
      target,
      (value as Record<string, unknown>)[key],
    ]),
  );
}

/** Each problem once: a value two tables share is found for each. */
function once(problems: EnvironmentsProblem[]): EnvironmentsProblem[] {
  const seen = new Set<string>();
  return problems.filter((problem) => {
    const key = JSON.stringify([problem.code, problem.message, problem.file, problem.line]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function differ(message: string, file: string, line?: number): EnvironmentsProblem {
  return {
    code: "ENVIRONMENTS_DIFFER",
    severity: "error",
    message,
    file,
    ...(line !== undefined && { line }),
  };
}

/** Target names joined with `, `, the last two with ` and `. */
function listOf(targets: string[]): string {
  if (targets.length < 2) return targets.join("");
  return `${targets.slice(0, -1).join(", ")} and ${targets[targets.length - 1]}`;
}

function escape(key: string): string {
  return key.replaceAll("~", "~0").replaceAll("/", "~1");
}
