// The rows of a new project's README.md and of init's printout: each value still REPLACE_ME,
// each example value to check, and each secret to create (spec/cli/projects.md, "README.md").
import type { Generated } from "./build-outputs.js";
import { exampleValue } from "./init-connection.js";
import { findFor } from "./init-find.js";
import { projectValues, type ProjectValue } from "./init-values.js";
import type { Content } from "./scaffold.js";

/** One value still REPLACE_ME: its name, places, what it is and where to find it. */
export interface ReplaceRow {
  name: string;
  places: { file: string; line: number }[];
  what: string;
  find: string;
  environments: string[];
}

/**
 * A row for each name still REPLACE_ME, from the project's REPLACE_ME diagnostics, so the
 * rows match `plan`; in the order the diagnostics first name each.
 */
export function replaceRows(files: Record<string, Content>, generated: Generated): ReplaceRow[] {
  const values = projectValues(files);
  const rows = new Map<string, ReplaceRow>();
  const places = generated.environmentReports
    .flatMap((report) => report.diagnostics)
    .filter((diagnostic) => diagnostic.code === "REPLACE_ME" && diagnostic.location)
    .map((diagnostic) => diagnostic.location!);
  for (const { file, line } of places) {
    const value = values.find((item) => item.file === file && item.line === line);
    const name = value?.name ?? file;
    const row = rows.get(name) ?? newRow(name, value, files, generated);
    rows.set(name, row);
    if (!row.places.some((place) => place.file === file && place.line === line))
      row.places.push({ file, line });
    // A value written once is in every environment; one under environments.<name>.values in its own.
    const environment = value?.environment ?? "all";
    if (!row.environments.includes(environment)) row.environments.push(environment);
  }
  return [...rows.values()];
}

function newRow(
  name: string,
  value: ProjectValue | undefined,
  files: Record<string, Content>,
  generated: Generated,
): ReplaceRow {
  return {
    name,
    places: [],
    what: value?.comment ?? "",
    find: value ? findFor(value, files, generated) : "",
    environments: [],
  };
}

/** One example value to check: its name, place, what it is and where to find it. */
export interface CheckRow {
  name: string;
  place: { file: string; line: number };
  what: string;
  find: string;
}

/** Each value kept from the example, which its comment says to check. */
export function checkRows(files: Record<string, Content>, generated: Generated): CheckRow[] {
  return projectValues(files)
    .filter((value) => value.kind === "setting" && value.comment?.endsWith(exampleValue))
    .map((value) => ({
      name: value.name,
      place: { file: value.file, line: value.line },
      what: value.comment!.slice(0, -exampleValue.length).replace(/[;,]\s*$/, ""),
      find: findFor(value, files, generated),
    }));
}

/** One secret to create: its name in the Key Vault, and what it holds. */
export interface SecretRow {
  name: string;
  holds: string;
}

/** Each `${secret:…}` the project names, with what its comment says it holds. */
export function secretRows(files: Record<string, Content>): SecretRow[] {
  return projectValues(files)
    .filter((value) => value.kind === "secret")
    .map((value) => ({
      name: /^\$\{secret:([^}]+)\}$/.exec(String(value.value))?.[1] ?? "",
      holds: holds(value.comment ?? value.name),
    }));
}

/** What a secret holds, without saying again that it is a Key Vault secret. */
function holds(comment: string): string {
  const text = comment
    .replace(/^Key Vault secret(:| holding)\s*/i, "")
    .replace(/,? (as a|in) Key Vault( secret)?$/i, "")
    .replace(/ in Key Vault\b/i, "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
