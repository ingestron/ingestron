// `${…}` references resolved from project.yaml alone, for hints while a
// document has a problem and the project does not load: values for the
// environment, the environment's name, and the project's id and name.
import { parseDocument } from "yaml";
import type { Project } from "./project.js";

type Manifest = {
  id?: unknown;
  name?: unknown;
  values?: Record<string, unknown>;
  environments?: Record<string, { values?: Record<string, unknown> } | null>;
};

/** The text with every reference resolved, or undefined when one cannot be (or must not be shown). */
export function resolveText(
  project: Project,
  text: string,
  environment: string | undefined,
): string | undefined {
  const manifest = manifestOf(project);
  if (!manifest) return undefined;
  const values = {
    ...manifest.values,
    ...(environment ? manifest.environments?.[environment]?.values : {}),
  };
  const lookup = (name: string): unknown => {
    if (name === "environment.name") return environment;
    if (name === "project.id") return manifest.id;
    if (name === "project.name") return manifest.name;
    return name.startsWith("values.") ? values[name.slice("values.".length)] : undefined;
  };
  return substitute(text, lookup, 3);
}

function substitute(
  text: string,
  lookup: (name: string) => unknown,
  depth: number,
): string | undefined {
  let unresolved = false;
  const out = text.replace(/\$\{([^}]+)\}/g, (_, name: string) => {
    const value = lookup(name.trim());
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      unresolved = true;
      return "";
    }
    // A value may itself use references, such as ${environment.name}.
    const inner = depth > 0 ? substitute(String(value), lookup, depth - 1) : undefined;
    if (inner === undefined) unresolved = true;
    return inner ?? "";
  });
  return unresolved ? undefined : out;
}

function manifestOf(project: Project): Manifest | undefined {
  try {
    // Tolerant: a YAML error elsewhere in the file leaves the values readable.
    const data = parseDocument(project.files.read("project.yaml") ?? "").toJS() as unknown;
    return data && typeof data === "object" ? (data as Manifest) : undefined;
  } catch {
    return undefined;
  }
}

/** The `${…}` reference around `offset` in `text`, if any. */
export function referenceAround(text: string, offset: number): string | undefined {
  const start = text.lastIndexOf("${", offset);
  const end = text.indexOf("}", start);
  if (start < 0 || end < offset - 1 || text.slice(start, end).includes("\n")) return undefined;
  return text.slice(start, end + 1);
}

/** "`${values.x}` is `…` in dev." for a reference that may be shown, else undefined. */
export function referenceValue(
  project: Project,
  reference: string,
  environment: string | undefined,
): string | undefined {
  if (/^\$\{(secret|envvar|file):/.test(reference)) return undefined;
  const value = resolveText(project, reference, environment);
  if (value === undefined) return undefined;
  return `\`${reference}\` is \`${value}\`${environment ? ` in ${environment}` : ""}.`;
}
