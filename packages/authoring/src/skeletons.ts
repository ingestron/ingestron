// Skeletons for a new, empty file: one document of the kind its folder holds,
// with the id from the file name and the project's ids to choose from.
import { basename } from "node:path";
import { packs, projectId } from "@ingestron/cli";
import type { Suggestion } from "./completion.js";
import { occurrences } from "./navigation.js";
import type { Project } from "./project.js";
import { idsOf } from "./context.js";
import { objectOf, standardPacks, unusedContracts } from "./smart.js";

/** A tab stop with a choice of values, or with one default. */
const stop = (n: number, values: string[], fallback: string) =>
  values.length > 0 ? `\${${n}|${values.join(",")}|}` : `\${${n}:${fallback}}`;

/** Skeletons for an empty file: its folder's kind, or every kind elsewhere. */
export function skeletons(project: Project, file: string, id?: string): Suggestion[] {
  const base = file
    .split("/")
    .at(-1)!
    .replace(/\.ya?ml$/, "");
  const source = idsOf(project, "Connection")[0] ?? "source";
  const all: Record<string, () => Suggestion[]> = {
    flows: () => [flowSkeleton(project, base)],
    connections: () => connectionSkeletons(project, id ?? base),
    contracts: () => [contractSkeleton(base, id ?? `${source}.${base}`)],
    transforms: () => [transformSkeleton(project, base, source)],
    products: () => [productSkeleton(project, base)],
  };
  const root = rootSkeletons[file];
  if (root) return [root(project)];
  const folder = file.split("/").at(-2) ?? "";
  return (folder in all ? [folder] : Object.keys(all)).flatMap((name) => all[name]!());
}

/** The files at a project's root that hold one known document. */
const rootSkeletons: Record<string, (project: Project) => Suggestion> = {
  "project.yaml": (project) => ({
    label: "Project manifest",
    kind: "document",
    snippet:
      `id: \${1:${projectId(basename(project.folder))}}\nenvironments:\n  dev: {}\n  prod: {}\n` +
      `imports:\n  - standard.yaml\n  - connections/*.yaml\n  - contracts/*.yaml\n  - flows/*.yaml\n`,
    documentation:
      "The project's id, environments and the files to load. Add `transforms/*.yaml` and `platform.yaml` when you have them.",
  }),
  "standard.yaml": (project) =>
    skeleton(
      "Standard",
      `${header("Standard", projectId(basename(project.folder)))}packs: [${stop(
        2,
        packs.map((pack) => `${pack.id}@${pack.version}`),
        "databricks@1",
      )}]\n$0`,
      "How the organisation builds data products: the packs, and its naming, rules and settings.",
    ),
  "platform.yaml": () =>
    skeleton("Platform", `${header("Platform", "platform")}$0`, "Where the project's assets go."),
};

const header = (kind: string, id: string) =>
  `apiVersion: ingestron.io/v1\nkind: ${kind}\nid: \${1:${id}}\n`;

function skeleton(kind: string, snippet: string, documentation: string): Suggestion {
  return { label: `${kind} document`, kind: "document", snippet, documentation };
}

function flowSkeleton(project: Project, base: string): Suggestion {
  const connections = idsOf(project, "Connection");
  const contract = unusedContracts(project)[0];
  const table = contract ? objectOf(project, contract) : base;
  const contractId = contract ?? `${connections[0] ?? "source"}.${table}`;
  return skeleton(
    "Flow",
    `${header("Flow", base)}source: ${stop(2, connections, "source")}\ntables:\n` +
      `  \${3:${table}}: { object: $3, contract: \${4:${contractId}} }\n`,
    "Tables loaded from one connection.",
  );
}

/** One per connector the standard's packs read, with that connector's settings to fill. */
function connectionSkeletons(project: Project, id: string): Suggestion[] {
  const own = standardPacks(project);
  const entries = own.flatMap((pack) =>
    (pack.connectors ?? []).map((connector) => ({ pack, connector })),
  );
  return entries.map(({ pack, connector }) => {
    const shared = entries.filter((entry) => entry.connector.id === connector.id).length > 1;
    const reach = pack.methods[connector.method]?.connectivity ?? [
      "public",
      "workspace",
      "private",
    ];
    const settings = connector.settings
      .filter((setting) => !setting.optional)
      .map(({ name, secret }, index) =>
        secret ? `  ${name}: \\\${secret:\${${index + 3}:${name}}}` : `  ${name}: $${index + 3}`,
      );
    return {
      label: `Connection: ${connector.title}${shared ? ` (${pack.id})` : ""}`,
      kind: "document" as const,
      snippet:
        `${header("Connection", id)}connector: ${connector.id}\nconnectivity: \${2|${reach.join(",")}|}\n` +
        `settings:\n${settings.join("\n")}\n`,
      documentation: connector.settings
        .map(({ name, description }) => `\`${name}\`: ${description}`)
        .join("\n\n"),
    };
  });
}

/** An ODPS data product publishing one of the project's contracts. */
function productSkeleton(project: Project, base: string): Suggestion {
  const contracts = idsOf(project, "DataContract").sort();
  const contract = stop(6, contracts, "contract");
  return skeleton(
    "DataProduct",
    `apiVersion: v1.1.0\nkind: DataProduct\nid: \${1:${base}}\nname: $2\nstatus: draft\n` +
      `description:\n  purpose: $4\nteam:\n  members:\n    - { username: $3, role: owner }\n` +
      `outputPorts:\n  - { name: $5, contractId: ${contract} }\n`,
    "A data product: who owns it, what it is for, and the contracts whose tables it publishes. Add products/*.yaml to project.yaml's imports.",
  );
}

function contractSkeleton(base: string, id: string): Suggestion {
  const types = "string,integer,number,boolean,date,timestamp";
  return {
    ...skeleton(
      "DataContract",
      `apiVersion: v3.1.0\nkind: DataContract\nid: \${1:${id}}\nversion: 1.0.0\n` +
        `status: draft\nschema:\n  - name: \${2:${base}}\n    logicalType: object\n    properties:\n` +
        `      - { name: \${3:id}, logicalType: \${4|${types}|}, required: true, primaryKey: true }\n`,
      "The columns a table has and the rules its rows follow.",
    ),
  };
}

function transformSkeleton(project: Project, base: string, source: string): Suggestion {
  const tables = occurrences(project)
    .filter((item) => item.definition && item.symbol.startsWith("table:"))
    .map((item) => item.symbol.slice("table:".length));
  return skeleton(
    "Transform",
    `${header("Transform", base)}inputs: [${stop(2, [...new Set(tables)], "table")}]\n` +
      `code: \\\${file:${base}.sql}\ncontract: \${3:${source}.${base}}\n`,
    "A table built from other tables with SQL or Python.",
  );
}

/** A snippet as plain text: each tab stop's default, or its first choice. */
export function plainText(snippet: string): string {
  const values = new Map<string, string>();
  const filled = snippet
    .replace(/\$\{(\d+)\|([^,|]*)[^|]*\|\}/g, (_, n: string, first: string) =>
      remember(values, n, first),
    )
    .replace(/\$\{(\d+):([^}]*)\}/g, (_, n: string, value: string) => remember(values, n, value));
  return filled
    .replace(/(?<!\\)\$(\d+)/g, (_, n: string) => values.get(n) ?? "")
    .replace(/\\\$/g, "$");
}

function remember(values: Map<string, string>, n: string, value: string): string {
  values.set(n, value);
  return value;
}
