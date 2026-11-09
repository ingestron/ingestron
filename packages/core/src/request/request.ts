// ingestron request: what to ask of whoever runs the data platform, for one
// environment: the values still REPLACE_ME, the environment variables to provide, the identity, what each
// switched-on capability needs, the features in use but switched off, the
// shared infrastructure the methods expect, what each pack expects to exist
// and its schedules, and the SQL to run once. The editor's command writes the
// same text (spec/cli/request.md).
import {
  resolveProject,
  type AnyDiagnostic,
  type FileSource,
  type Project,
} from "@ingestron/config";
import {
  kinds,
  resolveDefinitions,
  type Capability,
  type Pack,
  type RequestSection,
  type ResolvedModel,
} from "@ingestron/definitions";
import {
  environmentOutputs,
  generateAll,
  type Generated,
  type ProjectOptions,
} from "../generation/index.js";
import { packs } from "../packs/index.js";
import { suppliedFor } from "./request-supplied.js";
import { notKnown as whatIsNotKnown } from "./request-unknown.js";
import { valuesToProvide } from "./request-values.js";
import { valuesToReplace } from "./request-replace.js";

/**
 * The request as Markdown, ready to send; a short note instead when the
 * definitions have errors. A variable set nowhere is not an error here: the
 * request lists it under "Values to provide" and shows it as written.
 * `options` gives other packs or host values than the built-in packs and `process.env`.
 * @example
 * console.log(platformRequest(nodeFiles("definitions"), "prod"));
 */
export function platformRequest(
  files: FileSource,
  environment: string | undefined,
  options: ProjectOptions = {},
): string {
  const generated = generateAll(files, options.packs ?? packs, options.envvars ?? process.env);
  return requestFor(files, environment, generated, options).text;
}

/**
 * As an editor resolves: a variable set nowhere is not known yet. Every environment is
 * resolved together, so the request shows the generated files' mode (spec/cli/request.md).
 */
const resolving = {
  missingEnvvars: "information",
  environmentsTogether: true,
} as const;

/** The request's text, and whether the definitions resolved; false gives the short note. */
export function requestFor(
  files: FileSource,
  environment: string | undefined,
  generated: Generated,
  options: ProjectOptions = {},
): { text: string; resolved: boolean } {
  const available = options.packs ?? packs;
  // The live host environment unless given, read when each request is made.
  const envvars = options.envvars ?? process.env;
  const { model, diagnostics } = resolveDefinitions(files, {
    ...resolving,
    packs: [...available],
    envvars,
    environment,
  });
  const name = environment ?? "default";
  if (!model)
    return {
      text: `# Platform request (${name})\n\nThe definitions have problems; fix them first.\n`,
      resolved: false,
    };
  const project = hostProject(files, environment, envvars);
  const capabilities = available.flatMap((pack) => pack.capabilities ?? []);
  const notKnown = whatIsNotKnown(project, model);
  const references = project?.envvarReferences ?? [];
  const text = [
    `# Platform request: ${model.project.id} (${name})`,
    valuesToReplace(diagnostics),
    valuesToProvide(references, environment, notKnown, suppliedFor(generated, name)),
    identity(model),
    switchedOn(model, capabilities),
    switchedOff(diagnostics, capabilities),
    infrastructure(project, usedMethods(model)),
    ...packSections(model, available),
    // Files are never generated from a table whose source is not known.
    notKnown.sources.size > 0 ? undefined : sql(model, name),
  ]
    .filter(Boolean)
    .join("\n\n")
    .concat("\n");
  return { text, resolved: true };
}

/** The project as the host's values resolve it, a variable set nowhere not yet known. */
function hostProject(
  files: FileSource,
  environment: string | undefined,
  envvars: Readonly<Record<string, string | undefined>>,
): Project | undefined {
  return resolveProject(files, {
    kinds: Object.values(kinds),
    ...(environment && { environment }),
    envvars,
    missingEnvvars: "information",
  }).project;
}

/** Who the generated pipelines and jobs run as; nothing when no data platform pack runs them. */
function identity(model: ResolvedModel): string | undefined {
  const { run_as: runAs, workspace } = model.platform;
  const platform = model.tables.some((table) =>
    [table.ingest, table.transform, table.store].some((step) => step?.pack === "databricks"),
  );
  if (!runAs && !platform) return undefined;
  const principal = runAs ? String(Object.values(runAs)[0]) : undefined;
  // A value still REPLACE_ME is listed under Values to replace, not quoted as a name.
  const who =
    principal === undefined
      ? "the identity that deploys the bundle"
      : principal.includes("REPLACE_ME")
        ? "a principal not written yet (see Values to replace)"
        : `\`${principal}\``;
  const host =
    workspace.host && !workspace.host.includes("REPLACE_ME") ? ` in ${workspace.host}` : "";
  return `Pipelines and jobs run as ${who}${host}.`;
}

function switchedOn(model: ResolvedModel, capabilities: Capability[]): string | undefined {
  const on = capabilities.filter((capability) => model.platform.manage[capability.id]);
  if (on.length === 0) return undefined;
  const sections = on.map(
    (capability) =>
      `### ${capability.title} (\`manage.${capability.id}\`)\n\n${capability.does}\n\n${capability.needs.map((need) => `- ${need}`).join("\n")}`,
  );
  return `## Switched on\n\n${sections.join("\n\n")}`;
}

/** Features the definitions use while the platform has them off, from the CAPABILITY_OFF warnings. */
function switchedOff(diagnostics: AnyDiagnostic[], capabilities: Capability[]): string | undefined {
  const lines = diagnostics
    .filter((diagnostic) => diagnostic.code === "CAPABILITY_OFF")
    .flatMap((diagnostic) => {
      const pointer = diagnostic.fixes?.[0]?.edits[0]?.pointer ?? "";
      const capability = capabilities.find((item) => pointer === `/manage/${item.id}`);
      const what = diagnostic.message.split(":")[0];
      return capability ? [`- ${capability.title} (\`manage.${capability.id}\`): ${what}`] : [];
    });
  if (lines.length === 0) return undefined;
  return `## Used by the definitions, but switched off\n\n${[...new Set(lines)].join("\n")}`;
}

/** The platform's method settings, with values for this environment; secrets never shown. */
function infrastructure(project: Project | undefined, used: Set<string>): string | undefined {
  const platform = project?.documents.find((item) => item.kind === "Platform");
  const settings = (platform?.value as { settings?: Record<string, Record<string, unknown>> })
    ?.settings;
  // Settings of methods this environment does not use, such as ADF's under runs-on, are left out.
  const lines = Object.entries(settings ?? {})
    .filter(([method]) => used.has(method))
    .flatMap(([method, values]) =>
      Object.entries(values ?? {}).map(
        ([key, value]) => `- \`${method}\` \`${key}\`: ${shown(value)}`,
      ),
    );
  return lines.length > 0 ? `## Shared infrastructure\n\n${lines.join("\n")}` : undefined;
}

function shown(value: unknown): string {
  if (typeof value === "object" && value !== null && "$secret" in value) return "a secret";
  if (typeof value === "object" && value !== null && !Array.isArray(value))
    return Object.entries(value)
      .map(([key, item]) => {
        const text = shown(item);
        return text === "a secret" ? `\`${key}\`: a secret` : `\`${key}: ${text.slice(1, -1)}\``;
      })
      .join(", ");
  return `\`${typeof value === "string" ? value : JSON.stringify(value)}\``;
}

/** Each used pack's sections, those with the same title joined, in the order first seen. */
function packSections(model: ResolvedModel, available: readonly Pack[]): string[] {
  const sections = new Map<string, RequestSection>();
  for (const pack of available.filter((item) =>
    model.standard.packs.includes(`${item.id}@${item.version}`),
  ))
    for (const section of pack.request?.(model) ?? []) {
      const seen = sections.get(section.title);
      if (seen) seen.lines.push(...section.lines);
      else sections.set(section.title, { ...section, lines: [...section.lines] });
    }
  return [...sections.values()]
    .filter((section) => section.lines.length > 0)
    .map(({ title, intro, lines }) =>
      [`## ${title}`, ...(intro ? [intro] : []), lines.map((line) => `- ${line}`).join("\n")].join(
        "\n\n",
      ),
    );
}

/** The first pack's SQL to run once: `prerequisites.sql`, or this environment's `prerequisites/<name>.sql`. */
function sql(model: ResolvedModel, name: string): string | undefined {
  const text = environmentOutputs(model, name)
    .map(({ files }) => files["prerequisites.sql"] ?? files[`prerequisites/${name}.sql`])
    .find(Boolean);
  return text && `## SQL to run once (review first)\n\n\`\`\`sql\n${text}\`\`\``;
}

/** Every method a table of this environment uses. */
function usedMethods(model: ResolvedModel): Set<string> {
  return new Set(
    model.tables.flatMap((table) =>
      [table.ingest, table.transform, table.store, table.serve].flatMap((step) =>
        step ? [step.method] : [],
      ),
    ),
  );
}
