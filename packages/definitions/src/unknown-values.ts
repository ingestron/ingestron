// Values not known yet: text that holds an unset reference, the text the loader left
// for a `${envvar:…}` whose variable is set nowhere (specification section 1;
// spec/config/syntax.md section 5.1).
import type { Project } from "@ingestron/config";
import type { Source } from "./diagnostics.js";

/** True for text that holds one of the project's unset references, or a list or mapping holding such text. */
export function holdsUnsetEnvvar(project: Project, value: unknown): boolean {
  if (project.unsetEnvvars.length === 0) return false;
  return holds(project.unsetEnvvars, value, new Set());
}

function holds(references: readonly string[], value: unknown, seen: Set<object>): boolean {
  if (typeof value === "string") return references.some((text) => value.includes(text));
  if (value === null || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).some((child) => holds(references, child, seen));
}

/** True when the value written at `at` is text that holds an unset reference. */
export function unsetEnvvarAt(project: Project, at: Source): boolean {
  const value = valueAt(at.document.value, at.pointer);
  return typeof value === "string" && holdsUnsetEnvvar(project, value);
}

/** The value at a JSON Pointer, or undefined when there is none. */
function valueAt(value: unknown, pointer: string): unknown {
  if (pointer === "") return value;
  let current = value;
  for (const key of pointer.slice(1).split("/")) {
    if (current === null || typeof current !== "object") return undefined;
    const name = key.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!Object.hasOwn(current, name)) return undefined;
    current = (current as Record<string, unknown>)[name];
  }
  return current;
}
