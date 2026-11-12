// What --help shows: the commands, the options, and the usage text.

/**
 * The commands, in the order help shows them.
 * @public
 */
export const commands = [
  { name: "plan", summary: "Show what would change in each pack's output folder." },
  { name: "apply", summary: "Write the changes. Files edited by hand are never overwritten." },
  { name: "check", summary: "Fail when the output is not up to date (for CI). Writes nothing." },
  {
    name: "compare",
    summary: "Show what differs between two environments, after resolving.",
  },
  {
    name: "contract",
    summary:
      "Draft a contract from a sample CSV or JSON file, or with --from-metadata from imported source metadata.",
  },
  {
    name: "request",
    summary: "Print what to ask of whoever runs the data platform, per environment.",
  },
  { name: "schemas", summary: "Write editor schemas for VS Code's YAML extension." },
  {
    name: "init",
    summary: "Create a project from a connection, a starter or a published standard.",
  },
  { name: "standard", summary: "Install or list published standards." },
  {
    name: "source",
    summary: "Request source metadata from its owners, or import the file they send.",
  },
] as const;

/**
 * The options, in the order help shows them.
 * @public
 */
export const flags = [
  {
    flag: "--connector <id>",
    summary: "init: the source connector; otherwise choose by category.",
  },
  {
    flag: "--connectivity <kind>",
    summary: "init: private, workspace or public source reachability.",
  },
  {
    flag: "--via <databricks|adf-databricks|adf-synapse|adf-duckdb|adf-landing>",
    summary:
      "init: the route: Databricks directly, or ADF into Databricks, Synapse views, DuckDB tables or the landed files alone.",
  },
  {
    flag: "--env <name>",
    summary:
      "compare and request: only this environment (repeatable). Default: all in project.yaml. source and contract --from-metadata: one environment. init: the environments.",
  },
  {
    flag: "--connection <id>",
    summary: "source request: only this connection. Default: every connection a flow reads.",
  },
  {
    flag: "--object <text>",
    summary:
      "source import: the table a file of one table describes, when its path does not name it.",
  },
  {
    flag: "--dry-run",
    summary: "source import: show what the file would change and write nothing.",
  },
  {
    flag: "--from-metadata",
    summary: "contract: draft from the source metadata of the tables named, such as sales.orders.",
  },
  {
    flag: "--needed",
    summary: "contract --from-metadata: draft every table that needs a contract and names none.",
  },
  { flag: "--definitions <dir>", summary: "Folder with project.yaml. Default: ." },
  { flag: "--out <dir>", summary: "Output folder. Default: build" },
  { flag: "--no-diff", summary: "Plans without line diffs." },
  {
    flag: "--allow-extra",
    summary: "check: allow files in the output folder that were not generated.",
  },
  {
    flag: "--template <name|path|url>",
    summary: "init: a built-in template, a folder or a Git URL.",
  },
  {
    flag: "--kit <id[@version]|url>",
    summary:
      "init: start from a published standard, such as duckdb/local-medallion@2026-11-10, or <git-url>#<path>@<tag>.",
  },
  {
    flag: "--name <id>",
    summary:
      "init: the project's id; contract: the contract's. Default: the folder's or file's name.",
  },
  {
    flag: "--standard <path|url>",
    summary: "init: use this standard instead of the supplied default.",
  },
  {
    flag: "--set <name>=<text>",
    summary:
      "init: write a value in place of REPLACE_ME, by its name, such as source_server or prod.storage_account (repeatable).",
  },
  { flag: "--yes", summary: "init: take the default of each choice not given as a flag." },
  {
    flag: "--platform <id>",
    summary: "standard list: only the standards for this platform, such as duckdb.",
  },
  { flag: "--help", summary: "Show this text." },
] as const;

/** The width of the options column: the longest flag and two spaces. */
const flagWidth = Math.max(...flags.map(({ flag }) => flag.length)) + 2;

/** Usage text for --help and mistakes. */
export const usage = [
  "Usage: ingestron <plan|apply|check|compare|contract|request|schemas|init|standard|source> [options]",
  "",
  ...commands.map(({ name, summary }) => `  ${name.padEnd(10)}${summary}`),
  "",
  "Options:",
  ...flags.map(({ flag, summary }) => `  ${flag.padEnd(flagWidth)}${summary}`),
  "",
].join("\n");
