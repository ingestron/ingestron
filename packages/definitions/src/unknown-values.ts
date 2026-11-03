// Values not known yet: text that holds a placeholder the loader left for an unset
// variable (specification section 1; spec/config/syntax.md section 5.1).
import type { Project } from "@ingestron/config";
import type { Source } from "./diagnostics.js";

/** True for text that holds one of the project's placeholders, or a list or mapping holding such text. */
export function holdsPlaceholder(project: Project, value: unknown): boolean {
  if (project.placeholders.length === 0) return false;
  return holds(project.placeholders, value, new Set());
}

function holds(placeholders: readonly string[], value: unknown, seen: Set<object>): boolean {
  if (typeof value === "string") return placeholders.some((text) => value.includes(text));
  if (value === null || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).some((child) => holds(placeholders, child, seen));
}

/** True when the value written at `at` is text that holds a placeholder. */
export function placeholderAt(project: Project, at: Source): boolean {
  const value = valueAt(at.document.value, at.pointer);
  return typeof value === "string" && holdsPlaceholder(project, value);
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
