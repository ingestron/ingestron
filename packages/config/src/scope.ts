// What `${values.…}`, `${environment.…}` and `${project.…}` can see,
// and the lookup of one such path.

import type { LoadContext } from "./context.js";
import { isRecord, isSafeKey } from "./data.js";
import { error, type Location } from "./diagnostics.js";
import type { Expression } from "./references.js";

/** The data that references can read. */
export interface Scope {
  /** Merged project values; `undefined` while the values themselves are resolved. */
  values?: unknown;
  /** The selected environment, when there is one. */
  environment?: { name: string };
  /** Fields copied from the manifest. */
  project: { id: string; name?: string };
}

/** The state of resolving one document (or the manifest's values). */
export interface Walk {
  context: LoadContext;
  scope: Scope;
  /** For each JSON Pointer in the result, where its value was written. */
  sourceMap: Map<string, Location>;
  /** The `file#pointer` includes currently being resolved, outermost first. */
  includeStack: string[];
}

type PathExpression = Extract<Expression, { type: "path" }>;

/**
 * Reads `${root.a.b}` from the scope. Reports a diagnostic and returns
 * `undefined` when the path does not exist.
 */
export function lookupPath(
  expression: PathExpression,
  source: string,
  location: Location,
  walk: Walk,
): unknown {
  let current = rootValue(expression, source, location, walk);
  if (current === undefined) return undefined;
  for (const key of expression.path) {
    if (!hasChild(current, key)) {
      walk.context.diagnostics.push(
        error(
          "UNKNOWN_VALUE",
          `"${source}" has no value: "${key}" is not defined.`,
          location,
          availableKeys(current),
        ),
      );
      return undefined;
    }
    current = childOf(current, key);
  }
  return structuredClone(current);
}

function rootValue(expression: PathExpression, source: string, location: Location, walk: Walk) {
  const { scope, context } = walk;
  if (expression.root === "values" && scope.values === undefined) {
    context.diagnostics.push(
      error(
        "VALUES_SELF_REFERENCE",
        `"${source}" refers to values, but values cannot refer to other values.`,
        location,
        "Write the value out in full, or build the combined text in the document that uses it.",
      ),
    );
    return undefined;
  }
  if (expression.root === "environment" && scope.environment === undefined) {
    context.diagnostics.push(
      error(
        "NO_ENVIRONMENT",
        `"${source}" needs an environment, but none was selected.`,
        location,
        'Choose one with the "environment" load option.',
      ),
    );
    return undefined;
  }
  return scope[expression.root];
}

function hasChild(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return /^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length;
  return isRecord(value) && isSafeKey(key) && Object.hasOwn(value, key);
}

function childOf(value: unknown, key: string): unknown {
  return Array.isArray(value) ? value[Number(key)] : (value as Record<string, unknown>)[key];
}

function availableKeys(value: unknown): string {
  const keys = isRecord(value) ? Object.keys(value) : [];
  return keys.length > 0
    ? `Available here: ${keys.join(", ")}.`
    : "There are no named values here.";
}
