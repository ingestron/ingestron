// Which schema failures an unset reference causes (spec §5.1): those are left out,
// because the value they judge is not known on this computer.
import { isRecord } from "../internal/data.js";

/** What {@link withoutUnsetEnvvars} reads of a schema failure; Ajv's errors have it all. */
export interface UnsetEnvvarFailure {
  /** The schema keyword that failed, such as `pattern` or `anyOf`. */
  keyword: string;
  /** Where the failing value is, as a JSON Pointer. */
  instancePath: string;
  /** Where the failing keyword is in the schema, such as `#/properties/mode/anyOf`. */
  schemaPath: string;
  /** The failing value; Ajv gives it with its `verbose` option. */
  data?: unknown;
  /** The failing keyword's value, such as a `oneOf`'s alternatives (`verbose`). */
  schema?: unknown;
  /** The schema that holds the failing keyword, such as an `if`'s `then` and `else` (`verbose`). */
  parentSchema?: unknown;
}

const combinators = new Set(["oneOf", "anyOf", "if"]);

/**
 * The failures without those an unset reference causes (spec §5.1). Text that holds
 * one fails any keyword but `type` only because its value is not known yet. A `oneOf`,
 * `anyOf` or `if` is left out, with every failure inside it, when one of its
 * alternatives failed and each failure inside that alternative was left out.
 */
export function withoutUnsetEnvvars<T extends UnsetEnvvarFailure>(
  failures: readonly T[],
  holdsUnsetEnvvar: (text: string) => boolean,
): T[] {
  const left = new Set(
    failures.filter(
      (failure) =>
        !combinators.has(failure.keyword) &&
        failure.keyword !== "type" &&
        typeof failure.data === "string" &&
        holdsUnsetEnvvar(failure.data),
    ),
  );
  if (left.size === 0) return [...failures];
  // An inner combinator left out can leave out the alternative of an outer one.
  for (let changed = true; changed;) {
    changed = false;
    for (const combinator of failures.filter((failure) => combinators.has(failure.keyword))) {
      if (left.has(combinator)) continue;
      const groups = alternativesOf(combinator).map((prefixes) =>
        failures.filter((failure) => inside(failure, combinator, prefixes)),
      );
      if (!groups.some((group) => group.length > 0 && group.every((item) => left.has(item))))
        continue;
      [combinator, ...groups.flat()].forEach((failure) => left.add(failure));
      changed = true;
    }
  }
  return failures.filter((failure) => !left.has(failure));
}

/**
 * Where each alternative's failures are in the schema: under its own place, and, when the
 * alternative itself is a local `$ref`, under the schema it names, where Ajv reports them.
 * Only that one `$ref` is followed (spec §5.1).
 */
function alternativesOf(combinator: UnsetEnvvarFailure): string[][] {
  if (combinator.keyword === "if") {
    const base = combinator.schemaPath.slice(0, -"/if".length);
    const parent = isRecord(combinator.parentSchema) ? combinator.parentSchema : {};
    return ["then", "else"].map((branch) => places(`${base}/${branch}`, parent[branch]));
  }
  const alternatives = Array.isArray(combinator.schema) ? (combinator.schema as unknown[]) : [];
  return alternatives.map((schema, index) => places(`${combinator.schemaPath}/${index}`, schema));
}

function places(at: string, schema: unknown): string[] {
  const reference = isRecord(schema) ? schema.$ref : undefined;
  return typeof reference === "string" && reference.startsWith("#") ? [at, reference] : [at];
}

/** True when the failure comes from one of these schema places, at or below the combinator's value. */
function inside(
  failure: UnsetEnvvarFailure,
  combinator: UnsetEnvvarFailure,
  prefixes: readonly string[],
): boolean {
  if (failure === combinator) return false;
  const at = combinator.instancePath;
  if (failure.instancePath !== at && !failure.instancePath.startsWith(`${at}/`)) return false;
  return prefixes.some(
    (prefix) => failure.schemaPath === prefix || failure.schemaPath.startsWith(`${prefix}/`),
  );
}
