// Command-line arguments.
import { parseArgs } from "node:util";

/** What the user asked for. */
export interface Options {
  command: "plan" | "apply" | "check" | "compare" | "request" | "contract" | "schemas" | "init";
  /** contract: the sample file to draft a contract from. */
  sample?: string;
  /** Environments to generate; empty means every environment in project.yaml. */
  environments: string[];
  /** Folder with project.yaml. */
  definitions: string;
  /** Folder for the generated files; each environment gets a sub-folder. */
  out: string;
  /** Show line diffs in plans. */
  diffs: boolean;
  /** check: do not fail on files in an output folder that were not generated. */
  allowExtra: boolean;
  /** init: the folder to create the project in, the answers given as flags, and --yes. */
  init: {
    folder: string;
    template?: string;
    connector?: string;
    via?: string;
    connectivity?: string;
    name?: string;
    standard?: string;
    set: Record<string, string>;
    yes: boolean;
  };
}

/** The commands, in the order help shows them. */
export const commands = [
  { name: "plan", summary: "Show what would change in each environment's output folder." },
  { name: "apply", summary: "Write the changes. Files edited by hand are never overwritten." },
  { name: "check", summary: "Fail when the output is not up to date (for CI). Writes nothing." },
  {
    name: "compare",
    summary: "Show what differs between two environments, after resolving.",
  },
  {
    name: "contract",
    summary: "Draft a contract from a sample CSV or JSON file: column names and types.",
  },
  {
    name: "request",
    summary: "Print what to ask of whoever runs the data platform, per environment.",
  },
  { name: "schemas", summary: "Write editor schemas for VS Code's YAML extension." },
  { name: "init", summary: "Create a project from a connection and supported ingestion route." },
] as const;

/** The options, in the order help shows them. */
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
    flag: "--via <adf|databricks>",
    summary: "init: ADF ingestion into Databricks, or Databricks directly.",
  },
  {
    flag: "--env <name>",
    summary:
      "Only this environment (repeatable). Default: all in project.yaml. init: the environments.",
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
    flag: "--name <id>",
    summary:
      "init: the project's id; contract: the contract's. Default: the folder's or file's name.",
  },
  {
    flag: "--standard <path|url>",
    summary: "init: use this standard instead of the supplied default.",
  },
  {
    flag: "--set <value>=<text>",
    summary: "init: answer one of the project configuration questions (repeatable).",
  },
  { flag: "--yes", summary: "init: take the default for every question not answered." },
  { flag: "--help", summary: "Show this text." },
] as const;

/** The width of the options column: the longest flag and two spaces. */
const flagWidth = Math.max(...flags.map(({ flag }) => flag.length)) + 2;

/** Usage text for --help and mistakes. */
export const usage = [
  "Usage: ingestron <plan|apply|check|compare|contract|request|schemas|init> [options]",
  "",
  ...commands.map(({ name, summary }) => `  ${name.padEnd(10)}${summary}`),
  "",
  "Options:",
  ...flags.map(({ flag, summary }) => `  ${flag.padEnd(flagWidth)}${summary}`),
  "",
].join("\n");

const commandNames = new Set<string>(commands.map((command) => command.name));

const spec = {
  env: { type: "string", multiple: true },
  definitions: { type: "string", default: "." },
  out: { type: "string", default: "build" },
  "no-diff": { type: "boolean", default: false },
  "allow-extra": { type: "boolean", default: false },
  help: { type: "boolean", default: false },
  template: { type: "string" },
  connector: { type: "string" },
  via: { type: "string" },
  connectivity: { type: "string" },
  name: { type: "string" },
  standard: { type: "string" },
  set: { type: "string", multiple: true },
  yes: { type: "boolean", default: false },
} as const;

type Values = ReturnType<
  typeof parseArgs<{ options: typeof spec; allowPositionals: true }>
>["values"];

/** The options, "help", or a message explaining the mistake. */
export function readArgs(args: string[]): Options | "help" | { mistake: string } {
  let parsed;
  try {
    parsed = parseArgs({ args, allowPositionals: true, options: spec });
  } catch (cause) {
    return { mistake: cause instanceof Error ? cause.message : String(cause) };
  }
  const { values, positionals } = parsed;
  if (values.help) return "help";
  const [command, ...extra] = positionals;
  if (!known(command, extra)) return { mistake: `Unknown command "${positionals.join(" ")}".` };
  const init = initOptions(values, extra[0]);
  if ("mistake" in init) return init;
  return {
    command: command as Options["command"],
    environments: values.env ?? [],
    definitions: values.definitions,
    out: values.out,
    diffs: !values["no-diff"],
    allowExtra: values["allow-extra"],
    ...sampleOf(command, extra[0]),
    init,
  };
}

/** A command we have, with no more positional arguments than it takes (init and contract take one). */
function known(command: string | undefined, extra: string[]): command is string {
  const most = command === "init" || command === "contract" ? 1 : 0;
  return command !== undefined && commandNames.has(command) && extra.length <= most;
}

/** contract's sample file, the one positional argument it takes. */
function sampleOf(command: string, file: string | undefined): { sample?: string } {
  return command === "contract" && file !== undefined ? { sample: file } : {};
}

function initOptions(values: Values, folder = "."): Options["init"] | { mistake: string } {
  const set = answersOf(values.set ?? []);
  if (typeof set === "string") return { mistake: set };
  return {
    folder,
    ...(values.template !== undefined && { template: values.template }),
    ...(values.connector !== undefined && { connector: values.connector }),
    ...(values.via !== undefined && { via: values.via }),
    ...(values.connectivity !== undefined && { connectivity: values.connectivity }),
    ...(values.name !== undefined && { name: values.name }),
    ...(values.standard !== undefined && { standard: values.standard }),
    set,
    yes: values.yes,
  };
}

/** `--set key=value` pairs, or a mistake naming the one without `=`. */
function answersOf(pairs: string[]): Record<string, string> | string {
  const answers: Record<string, string> = {};
  for (const pair of pairs) {
    const at = pair.indexOf("=");
    if (at < 1) return `--set ${pair}: write it as <value>=<text>.`;
    answers[pair.slice(0, at)] = pair.slice(at + 1);
  }
  return answers;
}
