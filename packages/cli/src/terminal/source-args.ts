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

/** source import's arguments: the connection and the file, and no more. */
function importAction(extra: string[], flags: SourceFlags): SourceAction | { mistake: string } {
  const [connection, file, ...rest] = extra;
  if (connection === undefined || file === undefined)
    return {
      mistake:
        "source import needs a connection and a file, such as: source import erp sources/erp.catalog.csv.",
    };
  if (rest.length > 0) return { mistake: `Unknown command "source import ${extra.join(" ")}".` };
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
