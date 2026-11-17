// Completion inside text: after `${` the forms a reference takes, after
// `${values.` the project's values (and after `${values.a.` the names inside `a`), and inside a naming pattern's `{{ }}` the
// names a pattern can use. A transform's inputs are in inputs.ts.
import { nameVariables } from "@ingestron/definitions";
import { parse } from "yaml";
import { names, type Suggestion } from "./completion.js";
import { manifestValues, valueAt } from "../navigation/index.js";
import type { Project } from "../project/index.js";

/** What can follow `${`, as the definitions' syntax allows. */
const referenceForms: Record<string, string> = {
  "values.": "A value from project.yaml, for the environment.",
  "environment.name": "The selected environment's name.",
  "project.id": "The project's id.",
  "project.name": "The project's name.",
  "file:": "Another file: YAML is read as data, anything else as text.",
  "envvar:": "An environment variable of the machine that runs Ingestron.",
  "secret:": "A secret's name, resolved by the platform, never written out.",
};

/** Suggestions when the text before the cursor is inside `${` or `{{ tables.`. */
export function inlineCompletions(
  project: Project,
  before: string,
  file = "",
  environment?: string,
): Suggestion[] | undefined {
  const value = /\$\{\s*values\.((?:[\w-]+\.)*)[\w-]*$/.exec(before);
  if (value) return valueNames(project, before, file, value[1]!, environment);
  const field = /\$\{(project|environment)\.\w*$/.exec(before)?.[1];
  const forms = Object.entries(referenceForms).filter(([label]) => defined(project, label));
  if (field)
    return forms
      .filter(([label]) => label.startsWith(`${field}.`))
      .map(([label, documentation]) => ({
        label: label.slice(field.length + 1),
        kind: "reference",
        documentation,
      }));
  if (!/\$\{\w*$/.test(before)) return undefined;
  return forms.map(([label, documentation]) => ({ label, kind: "reference", documentation }));
}

/**
 * The values `${values.` can name. In project.yaml a value may read another, but not itself,
 * so the value on the cursor's line is left out. After `${values.a.`, the names inside `a`.
 */
function valueNames(
  project: Project,
  before: string,
  file: string,
  parents: string,
  environment: string | undefined,
): Suggestion[] {
  const path = parents.split(".").filter(Boolean);
  if (path.length > 0) {
    const inside = valueAt(manifestValues(project, environment), path);
    const keys =
      inside && typeof inside === "object" && !Array.isArray(inside) ? Object.keys(inside) : [];
    return keys.sort().map((label) => ({ label, kind: "reference" }));
  }
  const own =
    file === "project.yaml"
      ? /^\s*([\w-]+)\s*:/.exec(before.slice(before.lastIndexOf("\n") + 1))?.[1]
      : undefined;
  return names(project, "value:", "reference").filter((item) => item.label !== own);
}

/** `project.name` only when project.yaml has a name, `values.` only when it has values. */
function defined(project: Project, label: string): boolean {
  if (label !== "project.name" && label !== "values.") return true;
  try {
    const manifest = parse(project.files.read("project.yaml") ?? "") as Record<
      string,
      unknown
    > | null;
    return label === "values." ? Boolean(manifest?.values) : manifest?.name !== undefined;
  } catch {
    return true;
  }
}

/** The names a naming pattern can use inside `{{ }}`. */
export function patternNames(): Suggestion[] {
  return Object.entries(nameVariables).map(([label, documentation]) => ({
    label,
    kind: "reference",
    documentation,
  }));
}
