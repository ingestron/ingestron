// A new project's README.md, written once and then the user's: what to replace before
// deploying, the secrets to create, and how to deploy (spec/cli/projects.md, "README.md").
import { parse } from "yaml";
import type { Generated } from "./build-outputs.js";
import { deploySection } from "./init-deploy.js";
import { findFor } from "./init-find.js";
import { projectValues, type ProjectValue } from "./init-values.js";
import type { Content } from "./scaffold.js";

/** What README.md is written from. */
export interface ReadmeFacts {
  project: string;
  title: string;
  summary: string;
  today: string;
  files: Record<string, Content>;
  generated: Generated;
}

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

/** README.md's text. */
export function projectReadme(facts: ReadmeFacts): string {
  const rows = replaceRows(facts.files, facts.generated);
  const secrets = projectValues(facts.files).filter((value) => value.kind === "secret");
  return [
    `# ${facts.project}`,
    introduction(facts),
    "## Run it\n\n    ingestron plan     # what would be generated, and what is still REPLACE_ME\n    ingestron apply    # writes the files under build/",
    valuesSection(rows, local(facts.generated)),
    secretsSection(secrets, facts.files),
    deploySection(facts.generated.outputs),
    askSection(facts.generated),
    perEnvironment,
  ]
    .filter(Boolean)
    .join("\n\n")
    .concat("\n");
}

function introduction(facts: ReadmeFacts): string {
  const examples = exampleNames(facts.files);
  return [
    `${facts.title}. ${facts.summary}`.replace(/\.\. /, ". "),
    `\`ingestron init\` wrote this file on ${facts.today}; it is yours, and Ingestron never rewrites it.`,
    ...(examples ? [examples] : []),
  ].join("\n");
}

/** The example tables and contracts, to rename and change to the source's. */
function exampleNames(files: Record<string, Content>): string | undefined {
  const tables: string[] = [];
  const contracts = Object.keys(files)
    .filter((path) => path.startsWith("contracts/"))
    .sort();
  for (const [path, text] of Object.entries(files)) {
    if (!/^flows\/.*\.ya?ml$/.test(path)) continue;
    const flow = parse(String(text)) as { tables?: Record<string, unknown> };
    tables.push(...Object.keys(flow?.tables ?? {}));
  }
  if (tables.length === 0 || contracts.length === 0) return undefined;
  const code = (items: string[], one: string, many: string) =>
    `${items.length === 1 ? one : many} ${items.map((item) => `\`${item}\``).join(", ")}`;
  return `${code(tables, "The table", "The tables")} and ${code(contracts, "the contract", "the contracts")} are examples: rename the tables and change the contracts' columns to your source's.`;
}

/** Whether every environment runs on this computer, with nothing deployed. */
function local(generated: Generated): boolean {
  return generated.environmentReports.every((report) => generated.local.includes(report.name));
}

function valuesSection(rows: ReplaceRow[], onThisComputer: boolean): string {
  if (rows.length === 0)
    return `## Values to replace before deploying\n\nNothing to replace: ${onThisComputer ? "this project runs on this computer" : "the project runs as written"}.`;
  const lines = rows.map((row) => {
    const places = row.places
      .map((place, index) =>
        index > 0 && place.file === row.places[index - 1]!.file
          ? `\`:${place.line}\``
          : `\`${place.file}:${place.line}\``,
      )
      .join(", ");
    const environments = row.environments.includes("all") ? "all" : row.environments.join(", ");
    return `| \`${row.name}\` | ${places} | ${cell(row.what)} | ${cell(row.find)} | ${environments} |`;
  });
  return [
    "## Values to replace before deploying",
    "Ingestron cannot know these. `plan` warns about each; `ingestron check` fails until all are written.",
    [
      "| Name | File and line | What it is | Where to find it | Environments |",
      "| --- | --- | --- | --- | --- |",
      ...lines,
    ].join("\n"),
    "Write each in place, or set it when creating a project with `ingestron init --set <name>=<value>`.\nA value written once is used in every environment; to give one environment its own, write it in\n`project.yaml` under `environments.<name>.values` and use it as `${values.<name>}`.",
  ].join("\n\n");
}

function cell(text: string): string {
  return text.replaceAll("|", "\\|");
}

function secretsSection(secrets: ProjectValue[], files: Record<string, Content>): string {
  if (secrets.length === 0) return "";
  const vault = projectValues(files).some((value) => value.name === "key_vault")
    ? "each environment's `key_vault`"
    : "the Key Vault the platform reads";
  const lines = secrets.map((value) => {
    const name = /^\$\{secret:([^}]+)\}$/.exec(String(value.value))?.[1] ?? "";
    const holds = (value.comment ?? value.name).replace(/^Key Vault secret: /, "");
    return `| \`${name}\` | ${vault} | ${cell(holds.charAt(0).toUpperCase() + holds.slice(1))} |`;
  });
  return [
    "## Secrets to create",
    ["| Secret | In | Holds |", "| --- | --- | --- |", ...lines].join("\n"),
    "Azure portal: Key vaults, your vault, Secrets, Generate/Import. Never write a secret in a file.",
  ].join("\n\n");
}

function askSection(generated: Generated): string {
  const last = generated.environmentReports.at(-1)?.name ?? "dev";
  return `## Ask the platform team\n\n\`ingestron request --env ${last} > request-${last}.md\` writes what must exist before deploying, such as\nthe identities' access, as Markdown to send. It lists any value still \`REPLACE_ME\`.`;
}

const perEnvironment = [
  "## Values per environment",
  "- `project.yaml`, `environments.<name>.values`: names, hosts and paths, reviewed in Git. Start here.\n- `${envvar:NAME}`: a deploy-time value that the pipeline deploying `build/` supplies, such as\n  `BUNDLE_VAR_<name>`; `ingestron request` names each per platform. `.env.<environment>` (kept\n  out of Git) sets it on your computer for DuckDB.\n- `${secret:NAME}`: a Key Vault secret's name, never its value.",
].join("\n\n");
