// Where the owner finds a value still REPLACE_ME: the setting's `find` metadata, else the
// connector's documentation (definitions specification, "Connector authoring metadata").
import type { Connector } from "@ingestron/definitions";
import { parse } from "yaml";
import type { Generated } from "./build-outputs.js";
import { methodSettings } from "./init-platform.js";
import type { ProjectValue } from "./init-values.js";
import { packs } from "./packs.js";
import type { Content } from "./scaffold.js";

/** Where to find the values `init` itself composes the URLs from. */
const composed: Record<string, string> = {
  storage_account: "Azure portal: Storage accounts; the account's name",
  key_vault: "Azure portal: Key vaults; the vault's name",
};

const fallback = "Your platform team";

interface Written {
  kind?: string;
  id?: string;
  source?: string;
}

/** One sentence on where to find the value. */
export function findFor(
  value: ProjectValue,
  files: Record<string, Content>,
  generated: Generated,
): string {
  if (value.file === "project.yaml") return composed[value.name] ?? fallback;
  const document = (parse(String(files[value.file] ?? "")) ?? {}) as Written;
  if (document.kind === "Platform" && value.keys[0] === "settings")
    return found(methodSettings(value.keys[1]!)[value.keys[2]!]) ?? fallback;
  return sourceFind(value, document, generated) ?? fallback;
}

/** A connection setting's `find`, else the connector's documentation; for a flow's values too. */
function sourceFind(value: ProjectValue, document: Written, generated: Generated) {
  const connection = document.kind === "Connection" ? document.id : document.source;
  const connector = connection ? connectorOf(connection, generated) : undefined;
  if (!connector) return undefined;
  const setting =
    document.kind === "Connection"
      ? connector.settings.find((item) => item.name === value.keys[1])
      : undefined;
  return (
    setting?.find ?? `The source's own tools; see the connector's documentation: ${connector.docs}`
  );
}

function found(schema: unknown): string | undefined {
  const find = (schema as { find?: unknown } | undefined)?.find;
  return typeof find === "string" ? find : undefined;
}

/** The connector a connection is read with, by the method the model chose for it. */
function connectorOf(connection: string, generated: Generated): Connector | undefined {
  const tables = generated.environments.flatMap((environment) => environment.model.tables);
  const ingest = tables.find((table) => table.ingest?.connection.id === connection)?.ingest;
  if (!ingest) return undefined;
  return packs
    .flatMap((pack) => pack.connectors ?? [])
    .find((item) => item.id === ingest.connection.connector && item.method === ingest.method);
}
