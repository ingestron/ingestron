// A new project's README.md, written once and then the user's: what to replace before
// deploying, the secrets to create, and how to deploy (spec/cli/projects.md, "README.md").
import { parse } from "yaml";
import type { Generated } from "../generation/index.js";
import { deploySection } from "./init-deploy.js";
import {
  checkRows,
  replaceRows,
  secretRows,
  type CheckRow,
  type ReplaceRow,
  type SecretRow,
} from "./init-rows.js";
import { projectValues } from "./init-values.js";
import type { Content } from "./scaffold.js";

/** What README.md is written from. */
export interface ReadmeFacts {
  project: string;
  title: string;
  summary: string;
  today: string;
  files: Record<string, Content>;
  generated: Generated;
  /** The kit the project started from, `<id>@<version>`. */
  kit?: string;
}

/**
 * README.md's text.
 * @internal
 */
export function projectReadme(facts: ReadmeFacts): string {
  const { files, generated } = facts;
  const kit = facts.kit !== undefined;
  const factory = throughDataFactory(files);
  const starting = Boolean(setupChecklist(files));
  return [
    `# ${facts.project}`,
    introduction(facts, starting && lastEnvironment(generated)),
    setupChecklist(files),
    "## Build and review in VS Code\n\nOpen this folder in VS Code with the Ingestron extension. Use hovers, completions and the Reference panel to configure the YAML. In the Ingestron Project panel, choose Request source metadata, then Import source metadata when you have the catalogue file. Select an environment to review its previews and platform request; use Compare environments to inspect differences, including effective mode. Plan previews the changes, Apply writes local files under build/, and Check confirms they are up to date. These actions do not deploy or run the generated assets. Review the generated files before arranging deployment separately.",
    "## Run it\n\n```sh\ningestron plan     # what would be generated, and what is still REPLACE_ME\ningestron apply    # writes the files under build/\n```",
    valuesSection(replaceRows(files, generated, kit), local(generated), factory, starting),
    checkSection(checkRows(files, generated, kit)),
    secretsSection(secretRows(files), files),
    starting && generated.outputs.length === 0
      ? "## Deploy\n\nNothing to deploy yet: add a flow, then run `ingestron plan` to see the output folders and how to deploy each."
      : deploySection(generated.outputs),
    askSection(generated),
    perEnvironment(factory, String(files["platform.yaml"]).includes("synapse-copy:")),
  ]
    .filter(Boolean)
    .join("\n\n")
    .concat("\n");
}

/** Whether the standard names the Data Factory pack, which composes the storage and vault URLs. */
function throughDataFactory(files: Record<string, Content>): boolean {
  const standard = parse(String(files["standard.yaml"] ?? "")) as { packs?: unknown } | null;
  const named = Array.isArray(standard?.packs) ? standard.packs.map(String) : [];
  return named.some((ref) => ref.startsWith("adf@"));
}

/** The environment `ingestron request` is shown for: the last. */
function lastEnvironment(generated: Generated): string {
  return generated.environmentReports.at(-1)?.name ?? "dev";
}

/** The title and what the project is; `starting`, the environment to ask for, for one with no flow. */
function introduction(facts: ReadmeFacts, starting: string | false): string {
  const examples = exampleNames(facts.files);
  return [
    `${facts.title}. ${facts.summary}`.replace(/\.\. /, ". "),
    `\`ingestron init\` wrote this file on ${facts.today}; it is yours, and Ingestron never rewrites it.`,
    ...(starting
      ? [
          `Its lists show the project as it starts, with no flow. Once you add connections and flows, \`ingestron plan\` shows the values still to replace, and \`ingestron request --env ${starting}\` what the platform needs.`,
        ]
      : []),
    ...(facts.kit
      ? [`The standard comes from ${facts.kit}; STANDARD.md explains its choices.`]
      : []),
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

function valuesSection(
  rows: ReplaceRow[],
  onThisComputer: boolean,
  factory: boolean,
  empty: boolean,
): string {
  if (rows.length === 0 && empty)
    return "## Target settings\n\nReview the platform settings and environments before adding a connection. An empty project does not ingest data.";
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
    table(["Name", "File and line", "What it is", "Where to find it", "Environments"], lines),
    `Write each in place, or set it when creating a project with \`ingestron init --set <name>=<value>\`.\n${
      factory
        ? "The storage account and Key Vault are written for each environment in `project.yaml`: where\nenvironments differ, Data Factory takes them as parameters of the factory."
        : "A value written once is used in every environment; to give one environment its own, write it in\n`project.yaml` under `environments.<name>.values` and use it as `${values.<name>}`."
    }`,
  ].join("\n\n");
}

function checkSection(rows: CheckRow[]): string {
  if (rows.length === 0) return "";
  const lines = rows.map(
    (row) =>
      `| \`${row.name}\` | \`${row.place.file}:${row.place.line}\` | ${cell(row.what)} | ${cell(row.find)} |`,
  );
  return [
    "## Values to check",
    "These are the example's own values, which the source may not share. Nothing warns about them.",
    table(["Name", "File and line", "What it is", "Where to find it"], lines),
  ].join("\n\n");
}

function table(headings: string[], lines: string[]): string {
  return [
    `| ${headings.join(" | ")} |`,
    `| ${headings.map(() => "---").join(" | ")} |`,
    ...lines,
  ].join("\n");
}

function cell(text: string): string {
  return text.replaceAll("|", "\\|");
}

function secretsSection(secrets: SecretRow[], files: Record<string, Content>): string {
  const connected = Object.keys(files).some((path) => path.startsWith("connections/"));
  if (secrets.length === 0 && !connected)
    return "## Secrets to create\n\nNone yet: the project has no connection. Each `${secret:NAME}` a connection names is a Key Vault secret to create.";
  if (secrets.length === 0)
    return "## Secrets to create\n\nNone: no connection here names a Key Vault secret.";
  const vault = projectValues(files).some((value) => value.name === "key_vault")
    ? "each environment's `key_vault`"
    : "the Key Vault the platform reads";
  const lines = secrets.map((row) => `| \`${row.name}\` | ${vault} | ${cell(row.holds)} |`);
  return [
    "## Secrets to create",
    table(["Secret", "In", "Holds"], lines),
    "Azure portal: Key vaults, your vault, Objects, Secrets, + Generate/Import. Never write a secret in a file.",
  ].join("\n\n");
}

function askSection(generated: Generated): string {
  const last = lastEnvironment(generated);
  return `## Ask the platform team\n\n\`ingestron request --env ${last} > request-${last}.md\` writes what must exist before deploying, such as\nthe identities' access, as Markdown to send. It lists any value still \`REPLACE_ME\`.`;
}

function perEnvironment(factory: boolean, workspacePipelines: boolean): string {
  if (workspacePipelines)
    return "## Values per environment\n\nKeep explicit hosts, storage and vault names in `project.yaml`, `environments.<name>.values`, and reference them with `${values.NAME}`. Synapse workspace pipelines do not support `${envvar:NAME}` deploy-time substitutions. `${secret:NAME}` refers to a Key Vault secret name, never the password value.";
  const envvar = factory
    ? "- `${envvar:NAME}`: a deploy-time value that the pipeline deploying `build/` supplies;\n  `ingestron request` names each per platform. Data Factory takes one only as a whole value, so\n  keep the storage account and Key Vault in `project.yaml`."
    : "- `${envvar:NAME}`: a deploy-time value that the pipeline deploying `build/` supplies, such as\n  `BUNDLE_VAR_<name>`; `ingestron request` names each per platform. `.env.<environment>` (kept\n  out of Git) sets it on your computer for DuckDB.";
  return [
    "## Values per environment",
    `- \`project.yaml\`, \`environments.<name>.values\`: names, hosts and paths, reviewed in Git. Start here.\n${envvar}\n- \`\${secret:NAME}\`: a Key Vault secret's name, never its value.`,
  ].join("\n\n");
}

/** A source-free project starts with target review, then independent connection and flow actions. */
function setupChecklist(files: Record<string, Content>): string {
  if (Object.keys(files).some((path) => path.startsWith("flows/"))) return "";
  return "## Set up this project\n\n1. Review standard.yaml and platform.yaml, then each environment in project.yaml. Replace target placeholders before planning a flow. Keep fixed standard settings.\n2. Run Ingestron: Add connection in VS Code. Configure its named secret references and request or import source metadata. This does not add a flow.\n3. Run Ingestron: Add flow, choose the connection and source objects, then review contracts and ingestion settings.\n4. Run Plan, review generated files, then use local Apply and Check. These actions do not deploy or execute the assets.\n\nCLI equivalents: `ingestron connection add <id> --connector <id> --connectivity public` and `ingestron flow add <id> --connection <id> --object <name>`. An empty project confirms configuration only; it does not ingest data.";
}
