// Completion inside text: after `${` the forms a reference takes, after
// `${values.` the project's values, and inside a naming pattern's `{{ }}` the
// names a pattern can use. A transform's inputs are in inputs.ts.
import { nameVariables } from "@ingestron/definitions";
import { parse } from "yaml";
import { names, type Suggestion } from "./completion.js";
import type { Project } from "./project.js";

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
): Suggestion[] | undefined {
  // project.yaml's values may not refer to values.
  const inManifest = file === "project.yaml";
  if (/\$\{values\.\w*$/.test(before))
    return inManifest ? [] : names(project, "value:", "reference");
  const field = /\$\{(project|environment)\.\w*$/.exec(before)?.[1];
  const forms = Object.entries(referenceForms).filter(
    ([label]) => defined(project, label) && !(inManifest && label === "values."),
  );
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
