// ingestron compare: what differs between two environments once the
// definitions are resolved: the platform, the names, and each table's methods
// and settings. Secrets are never shown. The editor's command shows the same.
import { formatDiagnostics, type FileSource } from "@ingestron/config";
import {
  fullNameText,
  resolveDefinitions,
  type ResolvedModel,
  type ResolvedTable,
} from "@ingestron/definitions";
import type { ProjectOptions } from "../generation/index.js";
import { packs } from "../packs/index.js";

type Facts = Record<string, unknown>;

/**
 * The differences between two environments as Markdown, grouped by platform,
 * names and table; a note with the problems when either does not resolve.
 * `options` gives other packs or host values than the built-in packs and `process.env`.
 * @example
 * console.log(compareEnvironments(nodeFiles("definitions"), "dev", "prod"));
 * @public
 */
export function compareEnvironments(
  files: FileSource,
  a: string,
  b: string,
  options: ProjectOptions = {},
): string {
  // As plan resolves them, so the platform's mode is the generated files' (spec/cli/outputs.md).
  const resolving = {
    packs: [...(options.packs ?? packs)],
    envvars: options.envvars ?? process.env,
    environmentsTogether: true,
  };
  const left = resolveDefinitions(files, { ...resolving, environment: a });
  const right = resolveDefinitions(files, { ...resolving, environment: b });
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

/**
 * One table's facts, flattened to dotted keys, for comparing environments: its names, steps
 * and checks, what it cleanses, its time zone, its layer's duties and its quarantine.
 * @internal
 */
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
    ...flat({ cleanse: table.cleanse }),
    ...(table.timezone !== undefined && { timezone: table.timezone }),
    ...(table.does !== undefined && { does: table.does }),
    ...(table.quarantine && { quarantine: fullNameText(table.quarantine.fullName) }),
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
