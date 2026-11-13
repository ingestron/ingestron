// Command-line arguments.
import { parseArgs } from "node:util";
import { readAssistantNames } from "@ingestron/core/internal";
import { commands } from "./help.js";
import { subCommandOf, type AssistantAction, type StandardAction } from "./sub-args.js";
import { metadataTables, misplacedFlag, sourceAction, type SourceAction } from "./source-args.js";

export type { SourceAction } from "./source-args.js";
export type { StandardAction } from "./sub-args.js";

/** What the user asked for. */
export interface Options {
  command:
    | "plan"
    | "apply"
    | "check"
    | "compare"
    | "request"
    | "contract"
    | "schemas"
    | "init"
    | "standard"
    | "source"
    | "assistant";
  /** assistant: add the project guide and the files that point to it. */
  assistant?: AssistantAction;
  /** standard: install a kit's standard, or list the kits, for one platform when given. */
  standard?: StandardAction;
  /** source: print the source request, or import a file of source metadata. */
  source?: SourceAction;
  /** contract --from-metadata: the tables to draft, or every table that needs a contract. */
  fromMetadata?: { tables: string[]; needed: boolean };
  /** contract: the sample file to draft a contract from. */
  sample?: string;
  /** compare and request: the environments; empty means every environment in project.yaml. */
  environments: string[];
  /** Folder with project.yaml. */
  definitions: string;
  /** Folder for the generated files; each pack gets a sub-folder. */
  out: string;
  /** Show line diffs in plans. */
  diffs: boolean;
  /** check: do not fail on files in an output folder that were not generated. */
  allowExtra: boolean;
  /** init: the folder to create the project in, the answers given as flags, and --yes. */
  init: {
    folder: string;
    template?: string;
    kit?: string;
    connector?: string;
    via?: string;
    connectivity?: string;
    name?: string;
    standard?: string;
    set: Record<string, string>;
    yes: boolean;
    /** The raw values of --assistant; absent when it is not given. */
    assistants?: string[];
  };
}

const commandNames = new Set<string>(commands.map((command) => command.name));

/** The commands that generate every environment together, so take no --env (spec/cli/outputs.md, section 5). */
const generates = new Set(["plan", "apply", "check"]);

const spec = {
  env: { type: "string", multiple: true },
  definitions: { type: "string", default: "." },
  out: { type: "string", default: "build" },
  "no-diff": { type: "boolean", default: false },
  "allow-extra": { type: "boolean", default: false },
  help: { type: "boolean", default: false },
  template: { type: "string" },
  kit: { type: "string" },
  connector: { type: "string" },
  via: { type: "string" },
  connectivity: { type: "string" },
  name: { type: "string" },
  standard: { type: "string" },
  set: { type: "string", multiple: true },
  yes: { type: "boolean", default: false },
  platform: { type: "string" },
  connection: { type: "string" },
  object: { type: "string" },
  "dry-run": { type: "boolean", default: false },
  "from-metadata": { type: "boolean", default: false },
  needed: { type: "boolean", default: false },
  assistant: { type: "string", multiple: true },
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
  const chosen = commandOf(positionals, values);
  if ("mistake" in chosen) return chosen;
  const { command, extra, ...subCommand } = chosen;
  const unwanted =
    envMistake(command, values.env, subCommand) ?? misplacedFlag(command, values, subCommand);
  if (unwanted) return { mistake: unwanted };
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
    ...subCommand,
    init,
  };
}

/** The mistake in the --env given: for a command that generates every environment, or too many. */
function envMistake(
  command: string,
  env: string[] | undefined,
  { source, fromMetadata }: Pick<Chosen, "source" | "fromMetadata">,
): string | undefined {
  if (env !== undefined && generates.has(command))
    return `Every environment is generated together, so ${command} does not take --env. Use compare for two environments, or request for one.`;
  if (env !== undefined && env.length > 1 && (source || fromMetadata))
    return `${source ? "source" : "contract --from-metadata"} takes at most one --env.`;
  return undefined;
}

/** What `commandOf` found: the command, its other arguments and its sub-command, or a mistake. */
interface Chosen {
  command: string;
  extra: string[];
  standard?: StandardAction;
  source?: SourceAction;
  assistant?: AssistantAction;
  fromMetadata?: { tables: string[]; needed: boolean };
}

/** The command and the arguments after it, with standard's, source's and assistant's sub-commands, or a mistake. */
function commandOf(positionals: string[], values: Values): Chosen | { mistake: string } {
  const [command = "", ...extra] = positionals;
  const plain = subCommandOf(command, extra, values.platform);
  if (plain) return "mistake" in plain ? plain : { command, extra: [], ...plain };
  if (command === "source") {
    const source = sourceAction(extra, {
      connection: values.connection,
      object: values.object,
      dryRun: values["dry-run"],
    });
    return "mistake" in source ? source : { command, extra: [], source };
  }
  if (command === "contract" && values["from-metadata"]) {
    const fromMetadata = metadataTables(extra, values.needed);
    return "mistake" in fromMetadata ? fromMetadata : { command, extra: [], fromMetadata };
  }
  return known(command, extra)
    ? { command, extra }
    : { mistake: `Unknown command "${positionals.join(" ")}".` };
}

/** A command we have, with no more positional arguments than it takes (init and contract take one). */
function known(command: string, extra: string[]): boolean {
  const most = command === "init" || command === "contract" ? 1 : 0;
  return commandNames.has(command) && extra.length <= most;
}

/** contract's sample file, the one positional argument it takes. */
function sampleOf(command: string, file: string | undefined): { sample?: string } {
  return command === "contract" && file !== undefined ? { sample: file } : {};
}

/** The init options that are text, each kept only when it is given. */
const initTexts = [
  "template",
  "kit",
  "connector",
  "via",
  "connectivity",
  "name",
  "standard",
] as const;

function initOptions(values: Values, folder = "."): Options["init"] | { mistake: string } {
  const set = answersOf(values.set ?? []);
  if (typeof set === "string") return { mistake: set };
  const given = initTexts.flatMap((key) =>
    values[key] === undefined ? [] : [[key, values[key]] as const],
  );
  const named = values.assistant && readAssistantNames(values.assistant);
  if (named && "mistake" in named) return named;
  const assistants = values.assistant === undefined ? {} : { assistants: values.assistant };
  return { folder, ...Object.fromEntries(given), set, yes: values.yes, ...assistants };
}

/** `--set key=value` pairs, or a mistake naming the one without `=`. */
function answersOf(pairs: string[]): Record<string, string> | string {
  const answers: Record<string, string> = {};
  for (const pair of pairs) {
    const at = pair.indexOf("=");
    if (at < 1) return `--set ${pair}: write it as <name>=<text>.`;
    answers[pair.slice(0, at)] = pair.slice(at + 1);
  }
  return answers;
}
