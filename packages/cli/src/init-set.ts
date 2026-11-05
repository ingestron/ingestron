// `--set <name>=<text>` and `--set <environment>.<name>=<text>`: a value written where the
// name is, or refused before anything is written (spec/cli/projects.md, "Names and --set").
import { editYaml } from "./init-yaml.js";
import { projectValues, type ProjectValue } from "./init-values.js";
import type { Content } from "./scaffold.js";

/** Names that `init` now composes from the storage account. */
const composed = ["landing", "synapse_data_source_location", "duckdb_published"];

/**
 * Writes each answer at its name's locations. `asked` are a template's own questions, which
 * `init` writes to project.yaml itself. Throws an Error that says what to write instead.
 */
export function applySet(
  files: Record<string, Content>,
  set: Readonly<Record<string, string>>,
  environments: readonly string[],
  asked: readonly string[] = [],
): void {
  const values = projectValues(files);
  for (const [given, text] of Object.entries(set)) {
    if (asked.includes(given)) continue;
    const { name, environment } = split(given, environments);
    const at = locations(values, name, environment, given);
    refuseValue(name, text);
    for (const value of at)
      editYaml(files, value.file, (document) => document.setIn(value.keys, typed(value, text)));
  }
}

/** `<environment>.<name>` when the part before the dot is an environment, else the name. */
function split(given: string, environments: readonly string[]) {
  const dot = given.indexOf(".");
  if (dot < 0) return { name: given };
  const environment = given.slice(0, dot);
  if (!environments.includes(environment))
    throw new Error(
      `--set ${given}: the project has no environment "${environment}". It has: ${environments.join(", ")}.`,
    );
  return { name: given.slice(dot + 1), environment };
}

/** Where the name is written: in one environment's values, or everywhere. */
function locations(
  values: ProjectValue[],
  name: string,
  environment: string | undefined,
  given: string,
): ProjectValue[] {
  const all = values.filter((value) => value.name === name);
  if (all.length === 0) throw new Error(unknownName(values, name, given));
  if (environment === undefined) return all;
  const own = all.filter((value) => value.environment === environment);
  if (own.length === 0)
    throw new Error(
      `--set ${given}: ${name} is written once, for every environment. Write --set ${name}=…, then give ${environment} its own value in project.yaml under environments.${environment}.values.`,
    );
  return own;
}

function unknownName(values: ProjectValue[], name: string, given: string): string {
  const names = [...new Set(values.map((value) => value.name))];
  if (composed.includes(name) && names.includes("storage_account"))
    return `--set ${given}: ${name} is composed from the storage account now. Write --set storage_account=<the account's name>.`;
  return `--set ${given}: this project has no value "${name}". It has: ${names.join(", ") || "none"}.`;
}

function refuseValue(name: string, text: string): void {
  if (name === "key_vault" && /^https?:\/\//.test(text))
    throw new Error(
      `--set key_vault=${text}: write the Key Vault's name, such as kv-sales, not its URL; the platform composes the URL.`,
    );
}

/** The text as a number or true or false where the value written was one. */
function typed(value: ProjectValue, text: string): unknown {
  if (typeof value.value === "number" && Number.isFinite(Number(text))) return Number(text);
  if (typeof value.value === "boolean" && (text === "true" || text === "false"))
    return text === "true";
  return text;
}
