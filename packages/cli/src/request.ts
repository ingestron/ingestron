// ingestron request: what to ask of whoever runs the data platform, for one
// environment: the identity, what each switched-on capability needs, the
// features in use but switched off, the shared infrastructure the methods
// expect, what each pack expects to exist and its schedules, and the SQL to
// run once. The editor's command writes the same text.
import { resolve } from "node:path";
import { nodeFiles, resolveProject, type AnyDiagnostic, type FileSource } from "@ingestron/config";
import {
  kinds,
  resolveDefinitions,
  type Capability,
  type RequestSection,
  type ResolvedModel,
} from "@ingestron/definitions";
import type { Options } from "./args.js";
import { environmentsToGenerate } from "./environments.js";
import { generatedOutputs } from "./generate.js";
import type { Io } from "./io.js";
import { packs } from "./packs.js";

/** Prints the request for each environment. Returns the exit code. */
export function request(options: Options, io: Io): number {
  const definitions = resolve(io.cwd, options.definitions);
  const files = nodeFiles(definitions);
  const texts = environmentsToGenerate(definitions, options.environments).map((environment) =>
    platformRequest(files, environment),
  );
  io.write(texts.join("\n"));
  return texts.some((text) => text.includes("The definitions have problems")) ? 1 : 0;
}

/**
 * The request as Markdown, ready to send; a short note instead when the
 * definitions do not resolve.
 * @example
 * console.log(platformRequest(nodeFiles("definitions"), "prod"));
 */
export function platformRequest(files: FileSource, environment: string | undefined): string {
  const { model, diagnostics } = resolveDefinitions(files, { packs, environment, envvars: {} });
  const name = environment ?? "default";
  if (!model)
    return `# Platform request (${name})\n\nThe definitions have problems; fix them first.\n`;
  const capabilities = packs.flatMap((pack) => pack.capabilities ?? []);
  return [
    `# Platform request: ${model.project.id} (${name})`,
    identity(model),
    switchedOn(model, capabilities),
    switchedOff(diagnostics, capabilities),
    infrastructure(files, environment),
    ...packSections(model),
    sql(model, name),
  ]
    .filter(Boolean)
    .join("\n\n")
    .concat("\n");
}

function identity(model: ResolvedModel): string {
  const { run_as: runAs, workspace } = model.platform;
  const who = runAs ? `\`${Object.values(runAs)[0]}\`` : "the identity that deploys the bundle";
  return `Pipelines and jobs run as ${who}${workspace.host ? ` in ${workspace.host}` : ""}.`;
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
function infrastructure(files: FileSource, environment: string | undefined): string | undefined {
  const loaded = resolveProject(files, {
    kinds: Object.values(kinds),
    ...(environment && { environment }),
    envvars: {},
  });
  const platform = loaded.project?.documents.find((item) => item.kind === "Platform");
  const settings = (platform?.value as { settings?: Record<string, Record<string, unknown>> })
    ?.settings;
  const lines = Object.entries(settings ?? {}).flatMap(([method, values]) =>
    Object.entries(values ?? {}).map(
      ([key, value]) => `- \`${method}\` \`${key}\`: ${shown(value)}`,
    ),
  );
  return lines.length > 0 ? `## Shared infrastructure\n\n${lines.join("\n")}` : undefined;
}

function shown(value: unknown): string {
  if (typeof value === "object" && value !== null && "$secret" in value) return "a secret";
  return `\`${typeof value === "string" ? value : JSON.stringify(value)}\``;
}

/** Each used pack's sections, those with the same title joined, in the order first seen. */
function packSections(model: ResolvedModel): string[] {
  const sections = new Map<string, RequestSection>();
  for (const pack of packs.filter((item) =>
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

function sql(model: ResolvedModel, name: string): string | undefined {
  const text = generatedOutputs(model, name)
    .map(({ files }) => files["prerequisites.sql"])
    .find(Boolean);
  return text && `## SQL to run once (review first)\n\n\`\`\`sql\n${text}\`\`\``;
}
