// Command-line arguments.
import { parseArgs } from "node:util";
import { commands } from "./help.js";

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
    | "standard";
  /** standard: install a kit's standard, or list the kits, for one platform when given. */
  standard?: StandardAction;
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
  };
}

/** What `standard` was asked to do. */
export type StandardAction =
  { action: "install"; kit: string } | { action: "list"; platform?: string };

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
  const chosen = commandOf(positionals, values.platform);
  if ("mistake" in chosen) return chosen;
  const { command, extra, standard } = chosen;
  if (values.env !== undefined && generates.has(command))
    return {
      mistake: `Every environment is generated together, so ${command} does not take --env. Use compare for two environments, or request for one.`,
    };
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
    ...(standard && { standard }),
    init,
  };
}

/** standard's sub-command: `install <kit>` or `list`, or a mistake. */
function standardAction(
  extra: string[],
  platform: string | undefined,
): StandardAction | { mistake: string } {
  const [action, kit, ...rest] = extra;
  if (action === undefined) return { mistake: "standard needs install <kit> or list." };
  if (action === "install" && kit === undefined)
    return { mistake: "standard install needs a kit, such as duckdb/local-medallion." };
  if (action === "install" && kit !== undefined && rest.length === 0)
    return { action: "install", kit };
  if (action === "list" && kit === undefined)
    return { action: "list", ...(platform !== undefined && { platform }) };
  return { mistake: `Unknown command "standard ${extra.join(" ")}".` };
}

/** The command and the arguments after it, with standard's sub-command, or a mistake. */
function commandOf(
  positionals: string[],
  platform: string | undefined,
): { command: string; extra: string[]; standard?: StandardAction } | { mistake: string } {
  const [command = "", ...extra] = positionals;
  if (command === "standard") {
    const standard = standardAction(extra, platform);
    return "mistake" in standard ? standard : { command, extra: [], standard };
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
  return { folder, ...Object.fromEntries(given), set, yes: values.yes };
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
