// Resolves one YAML string: plain text, a whole-value reference, or text
// with references embedded in it.

import { isRecord } from "../internal/data.js";
import { error, information, type Location } from "../diagnostics/diagnostics.js";
import { parseDefinitionString, type Segment } from "./references.js";
import { resolveFileReference } from "./resolve-file.js";
import { lookupPath, type Walk } from "./scope.js";
import type { YamlFile } from "../files/yaml-file.js";

type ReferenceSegment = Extract<Segment, { type: "reference" }>;

/** The value a `${secret:…}` resolves to. It is passed on, never looked up. */
export interface SecretReference {
  $secret: string;
}

/**
 * True for the value produced by `${secret:…}`.
 * @example
 * isSecretReference({ $secret: "sales/erp-password" }) // true
 */
export function isSecretReference(value: unknown): value is SecretReference {
  return isRecord(value) && Object.keys(value).length === 1 && typeof value.$secret === "string";
}

/** Resolves a string scalar. See spec §4.2 for whole-value versus embedded. */
export function resolveString(
  text: string,
  location: Location,
  file: YamlFile,
  pointer: string,
  walk: Walk,
): unknown {
  const parsed = parseDefinitionString(text);
  if (!parsed.ok) {
    walk.context.diagnostics.push(error(parsed.code, parsed.message, location, parsed.hint));
    return undefined;
  }
  const [first] = parsed.segments;
  if (parsed.segments.length === 1 && first?.type === "text") return first.text;
  if (parsed.segments.length === 1 && first?.type === "reference") {
    return resolveReference(first, location, file, pointer, walk);
  }
  return joinSegments(parsed.segments, location, file, pointer, walk);
}

function joinSegments(
  segments: Segment[],
  location: Location,
  file: YamlFile,
  pointer: string,
  walk: Walk,
): string | undefined {
  let result = "";
  let failed = false;
  // Embedded values become part of this text, so their own locations are not
  // recorded: errors about the text must point at the text.
  const embeddedWalk = { ...walk, sourceMap: new Map<string, Location>() };
  for (const segment of segments) {
    const text =
      segment.type === "text"
        ? segment.text
        : asText(
            resolveReference(segment, location, file, pointer, embeddedWalk),
            segment.source,
            location,
            walk,
          );
    if (text === undefined) failed = true;
    else result += text;
  }
  return failed ? undefined : result;
}

function asText(
  value: unknown,
  source: string,
  location: Location,
  walk: Walk,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" || typeof value === "boolean") return String(value);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const diagnostic = isSecretReference(value)
    ? error(
        "SECRET_IN_TEXT",
        `"${source}" is a secret and cannot be part of text.`,
        location,
        "Use the secret as a whole value, for example: password: ${secret:scope/key}",
      )
    : error(
        "NOT_TEXT",
        `"${source}" is ${describeNonText(value)} and cannot be part of text.`,
        location,
        "Use it as a whole value, or refer to one item inside it.",
      );
  walk.context.diagnostics.push(diagnostic);
  return undefined;
}

function describeNonText(value: unknown): string {
  if (Array.isArray(value)) return "a list";
  if (value === null) return "empty (null)";
  if (typeof value === "number") return "not a finite number";
  return "a mapping";
}

function resolveReference(
  segment: ReferenceSegment,
  location: Location,
  file: YamlFile,
  pointer: string,
  walk: Walk,
): unknown {
  const { expression, source } = segment;
  if (expression.type === "path") return lookupPath(expression, source, location, walk);
  switch (expression.resolver) {
    case "file":
      return resolveFileReference(expression.argument, source, location, file, pointer, walk);
    case "envvar":
      return readEnvironmentVariable(expression.argument, source, location, pointer, walk);
    case "secret":
      return { $secret: expression.argument } satisfies SecretReference;
  }
}

function readEnvironmentVariable(
  name: string,
  source: string,
  location: Location,
  pointer: string,
  walk: Walk,
) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    walk.context.diagnostics.push(
      error(
        "BAD_ARGUMENT",
        `"${source}": "${name}" is not a valid environment variable name.`,
        location,
        "Names use letters, digits and _, and do not start with a digit.",
      ),
    );
    return undefined;
  }
  recordReference(name, pointer, location, walk);
  if (walk.context.deployEnvvars) return deployTimeText(name, walk);
  const value = walk.context.envvars[name];
  if (value !== undefined && value !== "") return value;
  return reportUnset(name, source, location, walk);
}

/**
 * A value supplied when deploying: the reference's own text, written without spaces so each
 * variable has one text, and an unset reference that later checks leave alone (spec §4.4).
 */
function deployTimeText(name: string, walk: Walk): string {
  const text = `\${envvar:${name}}`;
  walk.context.unsetEnvvars.add(text);
  return text;
}

/** An unset variable: information that leaves the reference as written, or an error. */
function reportUnset(name: string, source: string, location: Location, walk: Walk) {
  const { environment, missingEnvvars } = walk.context;
  const files = environment === undefined ? ".env" : `.env.${environment}`;
  if (missingEnvvars === "information") {
    // Keep the message starting "<name> isn't set;": authoring's deploy-advice.ts reads the
    // variable's name from it, and authoring's envvar and deploy-advice tests pin it.
    walk.context.diagnostics.push(
      information(
        "ENVVAR_MISSING",
        `${name} isn't set; add it to ${files} or set it before running Ingestron.`,
        location,
        "Ingestron reads .env files in the project folder and the environment the editor started with.",
      ),
    );
    // The reference stays as written, so the project still loads; later checks leave it alone.
    walk.context.unsetEnvvars.add(source);
    return source;
  }
  walk.context.diagnostics.push(
    error(
      "ENVVAR_MISSING",
      `Environment variable ${name} is not set.`,
      location,
      `Set ${name}, add it to ${environment === undefined ? ".env" : `${files} or .env`}, or remove "${source}".`,
    ),
  );
  return undefined;
}

/**
 * Notes that the value at `pointer` reads the variable (spec §4.6). The outermost file being
 * resolved is the document's own, even inside a `${file:…}`; the value is never kept.
 */
function recordReference(name: string, pointer: string, location: Location, walk: Walk): void {
  const document = walk.includeStack[0] ?? "";
  const file = document.slice(0, document.lastIndexOf("#"));
  const key = JSON.stringify([name, file, pointer]);
  if (walk.context.envvarReferences.has(key)) return;
  const setIn = walk.context.envvarsSetIn[name];
  const line = location.file === file ? { line: location.line } : {};
  walk.context.envvarReferences.set(key, { name, file, pointer, ...line, ...(setIn && { setIn }) });
}
