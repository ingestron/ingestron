// ingestron compare: what differs between two environments once the
// definitions are resolved: the platform, the names, and each table's methods
// and settings. Secrets are never shown. The editor's command shows the same.
import { resolve } from "node:path";
import { formatDiagnostics, nodeFiles, type FileSource } from "@ingestron/config";
import { resolveDefinitions, type ResolvedModel, type ResolvedTable } from "@ingestron/definitions";
import type { Options } from "./args.js";
import { environmentsToGenerate } from "./environments.js";
import type { Io } from "./io.js";
import { packs } from "./packs.js";

type Facts = Record<string, unknown>;

/** Prints the comparison of the two environments given, else the project's first two. */
export function compare(options: Options, io: Io): number {
  const definitions = resolve(io.cwd, options.definitions);
  const [a, b, ...more] = environmentsToGenerate(definitions, options.environments);
  if (!a || !b || (more.length > 0 && options.environments.length > 0)) {
    io.write(
      "compare needs two environments: name them with --env, or declare two in project.yaml.\n",
    );
    return 2;
  }
  const text = compareEnvironments(nodeFiles(definitions), a, b);
  io.write(text);
  return text.includes("the definitions have problems") ? 1 : 0;
}

/**
 * The differences between two environments as Markdown, grouped by platform,
 * names and table; a note with the problems when either does not resolve.
 * @example
 * console.log(compareEnvironments(nodeFiles("definitions"), "dev", "prod"));
 */
export function compareEnvironments(files: FileSource, a: string, b: string): string {
  const left = resolveDefinitions(files, { packs, environment: a, envvars: {} });
  const right = resolveDefinitions(files, { packs, environment: b, envvars: {} });
  for (const [name, result] of [
    [a, left],
    [b, right],
  ] as const)
    if (!result.model)
      return `# ${a} ↔ ${b}\n\n${name}: the definitions have problems\n\n${formatDiagnostics(result.diagnostics)}\n`;
  const before = sectionsOf(left.model!);
  const after = sectionsOf(right.model!);
  const groups = [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(
    (section) => {
      const lines = differences(before[section] ?? {}, after[section] ?? {});
      return lines.length > 0 ? [`## ${section}\n\n${lines.join("\n")}`] : [];
    },
  );
  const title = `# ${a} ↔ ${b}: ${left.model!.project.id}`;
  return `${[title, ...(groups.length > 0 ? groups : ["No differences."])].join("\n\n")}\n`;
}

function sectionsOf(model: ResolvedModel): Record<string, Facts> {
  return {
    Platform: flat(model.platform),
    Names: flat(model.names),
    ...Object.fromEntries(model.tables.map((table) => [`Table ${table.name}`, tableFacts(table)])),
  };
}

/** One table's facts, flattened to dotted keys, for comparing environments. */
export function tableFacts(table: ResolvedTable): Facts {
  const step = (found?: { method: string; settings: Record<string, unknown> }) =>
    found && { method: found.method, settings: found.settings };
  return {
    ...(table.endsAtFiles
      ? { "lands at": table.ingest?.output?.location ?? "the landed files" }
      : { "full name": Object.values(table.fullName).join(".") }),
    ...flat({
      ingest: table.ingest && {
        ...step(table.ingest),
        object: table.ingest.object,
        connection: {
          connectivity: table.ingest.connection.connectivity,
          settings: table.ingest.connection.settings,
        },
      },
      transform: step(table.transform),
      store: step(table.store),
      serve: step(table.serve),
    }),
    expectations: table.expectations.map((item) => `${item.name}: ${item.action}`),
  };
}

/** Every leaf by its dotted path; lists and secrets are leaves. */
function flat(value: unknown, prefix = ""): Facts {
  const secret = typeof value === "object" && value !== null && "$secret" in value;
  if (secret) return { [prefix]: "a secret" };
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return value === undefined ? {} : { [prefix]: value };
  return Object.assign(
    {},
    ...Object.entries(value).map(([key, item]) => flat(item, prefix ? `${prefix}.${key}` : key)),
  );
}

function differences(before: Facts, after: Facts): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => `- \`${key}\`: ${shown(before[key])} → ${shown(after[key])}`);
}

function shown(value: unknown): string {
  if (value === undefined) return "not set";
  return `\`${typeof value === "string" ? value : JSON.stringify(value)}\``;
}
