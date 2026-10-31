// A docs link as a Reference panel entry, for what the code describes: a
// document kind, a field and the fields under it, a method and its settings,
// a problem code and a connector. Other pages are left to the site.
import { packs } from "@ingestron/cli";
import {
  codeHelp,
  documentReference,
  loadingCodeHelp,
  methodReference,
  referenceKinds,
  type FieldInfo,
} from "@ingestron/definitions";
import { methodInfo } from "./methods.js";
import type { Project } from "./project.js";
import { documentEntry, fieldEntry, methodEntry, type ReferenceEntry } from "./reference.js";

const noSpot = {
  part: "key" as const,
  segments: [],
  pointer: "",
  text: "",
  range: [0, 0] as [number, number],
};

/** The entry for a docs path such as `/docs/reference/packs/adf#adf-copy`, else undefined. */
export function referenceForDocs(
  project: Project,
  path: string,
  environment: string | undefined,
): ReferenceEntry | undefined {
  const [page = "", anchor = ""] = path.split("#");
  if (page === "/docs/reference/documents") return documentsEntry(anchor);
  if (page === "/docs/reference/errors") return codeEntry(anchor);
  const pack = /^\/docs\/reference\/packs\/([\w-]+)$/.exec(page)?.[1];
  if (pack) return packEntry(project, pack, anchor, path, environment);
  const connector = /^\/docs\/connectors\/([\w-]+)$/.exec(page)?.[1];
  return connector ? connectorEntry(connector, path) : undefined;
}

function documentsEntry(anchor: string): ReferenceEntry | undefined {
  const kind = Object.keys(referenceKinds).find((name) => name.toLowerCase() === anchor);
  if (kind) return documentEntry(kind);
  for (const name of Object.keys(referenceKinds) as (keyof typeof referenceKinds)[]) {
    const fields = documentReference(name);
    const field = fields.find((item) => item.docs.endsWith(`#${anchor}`));
    if (field) return withChildren(fieldEntry(field, noSpot, `Field of ${name}`), field, fields);
  }
  return undefined;
}

function packEntry(
  project: Project,
  id: string,
  anchor: string,
  path: string,
  environment: string | undefined,
): ReferenceEntry | undefined {
  const pack = packs.find((item) => item.id === id);
  if (!pack) return undefined;
  if (pack.methods[anchor]) {
    const info = methodInfo(project, anchor, environment);
    return info && methodEntry(info);
  }
  for (const method of Object.keys(pack.methods)) {
    const fields = methodReference(pack, method);
    const field = fields.find((item) => item.docs === path);
    if (field)
      return withChildren(fieldEntry(field, noSpot, `Setting of ${method}`), field, fields);
  }
  return undefined;
}

/** The fields directly under a field, to go further. */
function withChildren(entry: ReferenceEntry, field: FieldInfo, all: FieldInfo[]): ReferenceEntry {
  const depth = field.path.length;
  const children = all.filter(
    (item) =>
      item.path.length > depth &&
      item.path.slice(0, depth).join("/") === field.path.join("/") &&
      item.path.slice(depth).every((key, index, rest) => key === "*" || index === rest.length - 1),
  );
  return children.length > 0
    ? {
        ...entry,
        fields: children.map((item) => ({
          name: item.name,
          docs: item.docs,
          ...(item.description && { text: item.description }),
        })),
      }
    : entry;
}

function codeEntry(code: string): ReferenceEntry | undefined {
  const help =
    codeHelp[code as keyof typeof codeHelp] ??
    loadingCodeHelp[code as keyof typeof loadingCodeHelp];
  if (!help) return undefined;
  return {
    title: code,
    subtitle: "Problem code",
    text: help.meaning,
    facts: [{ label: "Fix", value: help.fix }],
    docs: `/docs/reference/errors#${code}`,
  };
}

function connectorEntry(id: string, path: string): ReferenceEntry | undefined {
  const found = packs.flatMap((pack) =>
    (pack.connectors ?? [])
      .filter((item) => item.id === id)
      .map((connector) => ({ pack, connector })),
  );
  const [first] = found;
  if (!first) return undefined;
  return {
    title: first.connector.title,
    subtitle: "Connector",
    text: found
      .map(({ pack, connector }) => `${pack.id}, \`${connector.method}\`: ${connector.generates}`)
      .join(" "),
    facts: [{ label: "Object", value: first.connector.object }],
    fields: first.connector.settings.map((setting) => ({
      name: setting.name,
      text: `${setting.description}${setting.secret ? " A secret." : ""}`,
      docs: `${path}#settings`,
    })),
    fieldsHeading: "Settings",
    docs: path,
  };
}
