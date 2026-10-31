// Chapter grouping is presentation only; field meanings and capabilities stay in packs.
import type { Connector, FieldInfo } from "@ingestron/definitions";
import { connectorEntries, fieldPath, settingRows } from "./reference";

/** The settings shown in a connection's ingestion chapter and indexed for search.
 * @example ingestionRows("rest", "adf")
 */
export function ingestionRows(id: string, pack: string): FieldInfo[] {
  const connector = connectorEntries(id).find((entry) => entry.pack === pack)?.connector;
  if (!connector) throw new Error(`No ${pack} connector ${id}`);
  const keys = chapterKeys(connector);
  return settingRows(pack, connector.method).filter(
    (field) =>
      !keys ||
      keys.some((key) => fieldPath(field) === key || fieldPath(field).startsWith(`${key}.`)),
  );
}

function chapterKeys(connector: Connector): string[] | undefined {
  if (connector.reading)
    return ["mode", ...connector.reading.sourceOptions.map((name) => `source_options.${name}`)];
  if (connector.method === "adf-copy") return ["mode", "watermark_column", "format"];
  if (connector.method === "adf-files")
    return [
      "mode",
      "files",
      "format",
      "options",
      "schema_hints",
      ...(connector.id === "http" ? ["source_options"] : []),
    ];
  if (connector.method !== "lakeflow-connect") return undefined;
  const extra: Record<string, string[]> = {
    sqlserver: ["gateway_policy_id", "staging_schema"],
    kafka: ["value_format", "continuous", "starting_offset"],
  };
  return ["mode", "columns", ...(extra[connector.id] ?? [])];
}
