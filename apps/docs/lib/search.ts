// Search entries for reference rendered from code, which the MDX indexer
// cannot see: error codes, method settings and CLI commands.
import { commands, flags } from "@ingestron/cli";
import { codeHelp } from "@ingestron/definitions";
import type { StructuredData } from "fumadocs-core/mdx-plugins";
import { ingestionRows } from "./connector-settings";
import { anchorId, connectorEntries, fieldPath, packPages, packs, settingRows } from "./reference";

/** Headings and paragraphs to add to a page's search entries, by page URL. */
export function extraStructure(url: string): StructuredData {
  if (url === "/docs/reference/errors") return errorCodes();
  const page = packPages().find((candidate) => candidate.url === url);
  if (page) return methods(page.pack);
  if (url.startsWith("/docs/connectors/")) return connectorStructure(url);
  if (url === "/docs/reference/cli") return cli();
  return { headings: [], contents: [] };
}

function errorCodes(): StructuredData {
  const entries = Object.entries(codeHelp);
  return {
    headings: entries.map(([code]) => ({ id: code, content: code })),
    contents: entries.map(([code, help]) => ({
      heading: code,
      content: `${code}: ${help.meaning} Fix: ${help.fix}`,
    })),
  };
}

function methods(pack: string): StructuredData {
  const found = packs.find((candidate) => candidate.id === pack);
  const all = Object.entries(found?.methods ?? {}).map(([id, method]) => ({ pack, id, method }));
  return {
    headings: all.map(({ id }) => ({ id, content: id })),
    contents: all.flatMap(({ pack, id, method }) => [
      { heading: id, content: method.description },
      ...settingRows(pack, id).map((field) => ({
        heading: id,
        content:
          `${field.path.join(".")}: ${field.description ?? ""} ${(field.values ?? []).map((item) => item.value).join(", ")}`.trim(),
      })),
    ]),
  };
}

function cli(): StructuredData {
  return {
    headings: [],
    contents: [
      ...commands.map(({ name, summary }) => ({
        heading: undefined,
        content: `ingestron ${name}: ${summary}`,
      })),
      ...flags.map(({ flag, summary }) => ({ heading: undefined, content: `${flag}: ${summary}` })),
    ],
  };
}

function connectorStructure(url: string): StructuredData {
  const [, , , id, chapter] = url.split("/");
  const entries = connectorEntries(id ?? "");
  if (chapter?.endsWith("-connection")) {
    const connector = entries.find((entry) => chapter === `${entry.pack}-connection`)?.connector;
    const fields = connector?.settings ?? [];
    return {
      headings: fields.map((field) => ({ id: `connection-${field.name}`, content: field.name })),
      contents: fields.map((field) => ({
        heading: `connection-${field.name}`,
        content: `${connector?.title} ${field.name}: ${field.description} ${(field.values ?? []).join(", ")}`,
      })),
    };
  }
  if (chapter?.endsWith("-ingestion")) return ingestionStructure(id!, chapter.split("-")[0]!);
  return {
    headings: [],
    contents: chapter
      ? []
      : entries.map(({ pack, connector }) => ({
          heading: undefined,
          content: `${pack} ${connector.method}: ${connector.generates}. Object: ${connector.object}.`,
        })),
  };
}

/** Keep chapter search results recognisable outside their connection sidebar.
 * @example searchTitle("/docs/connectors/sqlserver/adf-connection", "Connection and access")
 */
export function searchTitle(url: string, title: string): string {
  const [, , area, id, chapter] = url.split("/");
  if (area !== "connectors" || !chapter) return title;
  const connector = connectorEntries(id ?? "")[0]?.connector;
  if (chapter === "examples") return connector ? `${connector.title}: ${title}` : title;
  const platform = chapter.startsWith("adf-") ? "ADF" : "Databricks";
  return connector ? `${connector.title} · ${platform}: ${title}` : title;
}

function ingestionStructure(id: string, pack: string): StructuredData {
  const fields = ingestionRows(id, pack);
  const reading = connectorEntries(id).find((entry) => entry.pack === pack)?.connector.reading;
  return {
    headings: fields.map((field) => ({ id: anchorId(field), content: fieldPath(field) })),
    contents: [
      ...fields.map((field) => ({
        heading: anchorId(field),
        content: `${fieldPath(field)}: ${field.description ?? ""} ${(field.values ?? []).map((value) => value.value).join(", ")}`,
      })),
      ...(reading
        ? [
            {
              heading: undefined,
              content: `query: ${reading.query}. Landing format: ${reading.format}. ${reading.runtime ? `Required runtime_kind: ${reading.runtime}.` : ""}`,
            },
          ]
        : []),
    ],
  };
}
