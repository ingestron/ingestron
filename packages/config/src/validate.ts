// Validates data against a JSON Schema and turns each failure into a diagnostic
// at the place the failing value was written.

import type { Ajv, ErrorObject, ValidateFunction } from "ajv/dist/ajv.js";
import { createAjv, dialectOf, defaultDialect, type Dialect } from "./dialects.js";
import { error, type Diagnostic, type Location } from "./diagnostics.js";
import { appendPointer } from "./json-pointer.js";
import { schemaFixes } from "./schema-fixes.js";
import { describeFailure } from "./schema-messages.js";
import type { JsonSchema } from "./kinds.js";

/** Finds where the value at a JSON Pointer was written. */
export type Locate = (pointer: string) => Location | undefined;

/**
 * Compiles schemas once per load, each with the JSON Schema version it
 * declares. `format` is not checked and unknown keywords are ignored, so
 * editor-only annotations do not break loading.
 */
export function createSchemaChecker() {
  const engines = new Map<Dialect, Ajv>();
  const compiled = new Map<JsonSchema, ValidateFunction>();
  function engineFor(schema: JsonSchema): Ajv {
    // defineKind has already refused unsupported versions.
    const dialect = dialectOf(schema) ?? defaultDialect;
    let engine = engines.get(dialect);
    if (!engine) {
      engine = createAjv(dialect, {
        allErrors: true,
        strict: false,
        validateFormats: false,
        // The failing value and its schema, for messages in the words of the YAML.
        verbose: true,
      });
      engines.set(dialect, engine);
    }
    return engine;
  }
  /** `file` is the document's own file: fixes are offered for problems written there. */
  return function check(
    schema: JsonSchema,
    value: unknown,
    locate: Locate,
    file?: string,
  ): Diagnostic[] {
    let validate = compiled.get(schema);
    if (!validate) {
      validate = engineFor(schema).compile(schema);
      compiled.set(schema, validate);
    }
    if (validate(value)) return [];
    const failures = validate.errors ?? [];
    return failures
      .flatMap((failure) => problemFor(failure, failures, schema, locate, file))
      .sort(byLocation);
  };
}

/** One failure as a problem with its fixes; none when it repeats another. */
function problemFor(
  failure: ErrorObject,
  failures: readonly ErrorObject[],
  schema: JsonSchema,
  locate: Locate,
  file: string | undefined,
): Diagnostic[] {
  const described = describeFailure(failure, failures, schema);
  if (!described) return [];
  const location = locate(failingPointer(failure));
  const problem = error("SCHEMA", described.message, location, described.hint);
  const fixes = file && location?.file === file ? schemaFixes(failure, file, schema) : [];
  return [fixes.length > 0 ? { ...problem, fixes } : problem];
}

/** In the order they appear in the files. */
function byLocation(a: Diagnostic, b: Diagnostic): number {
  const [x, y] = [a.location, b.location];
  if (!x || !y) return 0;
  return x.file.localeCompare(y.file) || x.line - y.line || x.column - y.column;
}

/** For an unexpected property, point at the property itself, not its parent. */
function failingPointer(failure: ErrorObject): string {
  if (failure.keyword !== "additionalProperties") return failure.instancePath;
  return appendPointer(failure.instancePath, String(failure.params.additionalProperty));
}

/**
 * Looks a pointer up in a source map. When the exact pointer is not there
 * (for example inside a value copied from `${values.…}`), the nearest
 * recorded parent is used.
 */
export function locateIn(sourceMap: ReadonlyMap<string, Location>): Locate {
  return (pointer) => {
    let current = pointer;
    while (current !== "" && !sourceMap.has(current)) {
      current = current.slice(0, current.lastIndexOf("/"));
    }
    return sourceMap.get(current);
  };
}
