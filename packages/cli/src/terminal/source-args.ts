// The arguments of `source` and of `contract --from-metadata`.

/** What `source` was asked to do. */
export type SourceAction =
  | { action: "request"; connection?: string }
  | { action: "import"; connection: string; file: string; object?: string; dryRun: boolean };

/** What `source import` and `source request` take as options. */
interface SourceFlags {
  connection: string | undefined;
  object: string | undefined;
  dryRun: boolean;
}

/** source's sub-command: `request`, or `import <connection> <file>`, or a mistake. */
export function sourceAction(
  extra: string[],
  flags: SourceFlags,
): SourceAction | { mistake: string } {
  const [action, ...rest] = extra;
  if (action === undefined) return { mistake: "source needs request or import." };
  if (action === "request" && rest.length === 0)
    return { action, ...(flags.connection !== undefined && { connection: flags.connection }) };
  if (action === "import") return importAction(rest, flags);
  return { mistake: `Unknown command "source ${extra.join(" ")}".` };
}

const importUsage =
  "source import takes a connection and a file, such as: source import erp sources/erp.catalog.csv.";

/** source import's arguments: the connection and the file, and no more. */
function importAction(extra: string[], flags: SourceFlags): SourceAction | { mistake: string } {
  const [connection, file, ...rest] = extra;
  if (connection === undefined || file === undefined) return { mistake: importUsage };
  if (rest.length > 0) return { mistake: importUsage };
  return {
    action: "import",
    connection,
    file,
    ...(flags.object !== undefined && { object: flags.object }),
    dryRun: flags.dryRun,
  };
}

/** contract --from-metadata: the tables named, or --needed, but not both and not neither. */
export function metadataTables(
  tables: string[],
  needed: boolean,
): { tables: string[]; needed: boolean } | { mistake: string } {
  if (tables.length === 0 && !needed)
    return {
      mistake: "contract --from-metadata needs a table, such as sales.orders, or --needed.",
    };
  if (tables.length > 0 && needed)
    return { mistake: "contract --from-metadata takes tables or --needed, not both." };
  return { tables, needed };
}

/** The flags of this feature as the command line gave them. */
interface Flags {
  "dry-run": boolean;
  object?: string | undefined;
  connection?: string | undefined;
  "from-metadata": boolean;
  needed: boolean;
}

/** The command's sub-command: what `source` or `contract --from-metadata` was asked. */
interface Chosen {
  source?: SourceAction | undefined;
  fromMetadata?: unknown;
}

/** Which command each flag is for. */
const owners: Record<string, string> = {
  "--dry-run": "source import",
  "--object": "source import",
  "--connection": "source request",
  "--from-metadata": "contract",
  "--needed": "contract --from-metadata",
};

/** The first flag given to a command it does not belong to, as the mistake that says so; else none. */
export function misplacedFlag(
  command: string,
  flags: Flags,
  { source, fromMetadata }: Chosen,
): string | undefined {
  const importing = source?.action === "import";
  const misplaced: [string, boolean][] = [
    ["--dry-run", flags["dry-run"] && !importing],
    ["--object", flags.object !== undefined && !importing],
    ["--connection", flags.connection !== undefined && source?.action !== "request"],
    ["--from-metadata", flags["from-metadata"] && command !== "contract"],
    ["--needed", flags.needed && !fromMetadata],
  ];
  const flag = misplaced.find(([, wrong]) => wrong)?.[0];
  return flag === undefined ? undefined : `${flag} is only for ${owners[flag]}.`;
}
