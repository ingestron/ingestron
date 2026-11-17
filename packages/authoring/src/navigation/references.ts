// `${…}` references resolved from project.yaml alone, for hints while a
// document has a problem and the project does not load: values for the
// environment, the environment's name, and the project's id and name.
import { parseDocument } from "yaml";
import type { Project } from "../project/index.js";

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
  const values = mergedValues(manifest, environment);
  const lookup = (name: string): unknown => {
    if (name === "environment.name") return environment;
    if (name === "project.id") return manifest.id;
    if (name === "project.name") return manifest.name;
    return name.startsWith("values.") ? valueAt(values, name.split(".").slice(1)) : undefined;
  };
  return substitute(text, lookup, 8);
}

/** project.yaml's values with the environment's merged over them, as written, or undefined. */
export function manifestValues(project: Project, environment: string | undefined): unknown {
  const manifest = manifestOf(project);
  return manifest && mergedValues(manifest, environment);
}

/** The value at `path`, reading mapping keys and list indexes. */
export function valueAt(values: unknown, path: readonly string[]): unknown {
  let current = values;
  for (const key of path) {
    if (Array.isArray(current) && /^(0|[1-9]\d*)$/.test(key)) current = current[Number(key)];
    else if (isMapping(current) && Object.hasOwn(current, key)) current = current[key];
    else return undefined;
  }
  return current;
}

function mergedValues(manifest: Manifest, environment: string | undefined): unknown {
  const override = environment ? manifest.environments?.[environment]?.values : undefined;
  return merge(manifest.values ?? {}, override ?? {});
}

/** Mappings merge by key; anything else replaces, as the loader merges an environment's values. */
function merge(base: unknown, override: unknown): unknown {
  if (!isMapping(base) || !isMapping(override)) return override;
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override))
    merged[key] = Object.hasOwn(merged, key) ? merge(merged[key], value) : value;
  return merged;
}

const isMapping = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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
    // A value may itself use references, such as ${environment.name} or another value; a
    // cycle runs out of depth and stays unresolved.
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

/**
 * "`${values.x}` is `…` in dev." for a reference that may be shown, else undefined. A value
 * set for the environment, or built from other references, says so.
 */
export function referenceValue(
  project: Project,
  reference: string,
  environment: string | undefined,
): string | undefined {
  if (/^\$\{(secret|envvar|file):/.test(reference)) return undefined;
  const value = resolveText(project, reference, environment);
  if (value === undefined) return undefined;
  const shown = `\`${reference}\` is \`${value}\`${environment ? ` in ${environment}` : ""}.`;
  return [shown, valueOrigin(project, reference, environment)].filter(Boolean).join(" ");
}

/** Where a `${values.…}` comes from: the environment's values, and what it is built from. */
function valueOrigin(
  project: Project,
  reference: string,
  environment: string | undefined,
): string | undefined {
  const path = /^\$\{\s*values\.([\w.-]+)\s*\}$/.exec(reference)?.[1]?.split(".");
  const manifest = path && manifestOf(project);
  if (!path || !manifest) return undefined;
  const override = environment && manifest.environments?.[environment]?.values;
  const where =
    valueAt(override, path) === undefined
      ? "It is set under `values` in project.yaml"
      : `It is set for ${environment} under \`environments.${environment}.values\` in project.yaml`;
  return `${where}${builtFrom(valueAt(mergedValues(manifest, environment), path))}.`;
}

/** ", built from `…`" for a value written with references, else nothing. */
function builtFrom(written: unknown): string {
  return typeof written === "string" && written.includes("${") ? `, built from \`${written}\`` : "";
}
