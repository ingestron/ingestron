// Connection drafts are plain files; callers own safe, non-overwriting writes.
import type { FileSource } from "@ingestron/config";
import { kinds } from "@ingestron/definitions";
import { stringify } from "yaml";
import { additionProject, projectAdditions, type ConnectionChoice } from "./addition-choices.js";
import { nameProblem } from "./scaffold.js";
import { definitionImport, type AddedImport } from "./definition-import.js";

/** A connection to add independently of any flow. @public */
export interface AddConnection {
  id: string;
  connector: string;
  /** Select the connector profile when multiple standard methods support it. */
  method?: string;
  connectivity: string;
  settings?: Record<string, unknown>;
  environment?: string;
}

/** A new definition file and its contents; existing files are never included. @public */
export interface DefinitionDraft {
  file: string;
  text: string;
  /** The import that loads the file, when no import in project.yaml matches it yet. */
  imports?: AddedImport;
}

/** Draft a standard-compatible connection, using named references for secret defaults. @public */
export function draftConnection(files: FileSource, input: AddConnection): DefinitionDraft {
  const project = additionProject(files, input.environment);
  checkNewId(
    input.id,
    "connection",
    project.all(kinds.connection).map(({ value }) => value.id),
  );
  const matches = projectAdditions(files, input.environment).connectors.filter(
    (item) => item.connector === input.connector && item.connectivity.includes(input.connectivity),
  );
  if (matches.length === 0)
    throw new Error(
      `The standard has no ingestion method for ${input.connector} with ${input.connectivity} connectivity.`,
    );
  const choice = input.method
    ? matches.find((item) => item.method === input.method)
    : matches.length === 1
      ? matches[0]
      : undefined;
  if (!choice)
    throw new Error(
      `Choose the connection profile with --method: ${matches.map((item) => item.method).join(", ")}.`,
    );
  const settings = connectionSettings(choice, input);
  const value = {
    apiVersion: "ingestron.io/v1",
    kind: "Connection",
    id: input.id,
    connector: input.connector,
    connectivity: input.connectivity,
    settings,
  };
  return includedDraft(files, `connections/${input.id}.yaml`, stringify(value), input.environment);
}

function connectionSettings(
  choice: ConnectionChoice,
  input: AddConnection,
): Record<string, unknown> {
  const settings: Record<string, unknown> = {};
  for (const meta of choice.settings) {
    const value = connectionValue(meta, input);
    if (value !== undefined) settings[meta.name] = value;
  }
  for (const key of Object.keys(input.settings ?? {}))
    if (!choice.settings.some((meta) => meta.name === key))
      throw new Error(`Unknown ${input.connector} setting: ${key}.`);
  return settings;
}

/** Refuse existing ids before constructing a path. */
export function checkNewId(id: string, kind: string, existing: string[]): void {
  const problem = nameProblem(id, "project")?.replace("project", kind);
  if (problem) throw new Error(problem);
  if (existing.includes(id)) throw new Error(`The ${kind} ${id} already exists.`);
}

/**
 * The draft with the import that loads it, when no import matches it yet; no existing definition
 * changes. Refuses when the imports leave the file out even then.
 */
export function includedDraft(
  files: FileSource,
  file: string,
  text: string,
  environment?: string,
): DefinitionDraft {
  if (files.list().includes(file)) throw new Error(`${file} already exists; nothing written.`);
  const imports = definitionImport(files, file);
  const overlay: FileSource = {
    list: () => [...files.list(), file],
    read: (path) =>
      path === file
        ? text
        : path === "project.yaml" && imports
          ? imports.project
          : files.read(path),
  };
  const project = additionProject(overlay, environment);
  if (!project.documents.some((document) => document.file === file))
    throw new Error(
      `Add ${file} or its folder's YAML glob to project.yaml imports, then try again. Nothing written.`,
    );
  return { file, text, ...(imports && { imports }) };
}

function connectionValue(
  meta: ConnectionChoice["settings"][number],
  input: AddConnection,
): unknown {
  const given = input.settings?.[meta.name];
  if (meta.secret && given !== undefined && !namedSecret(given))
    throw new Error(`Write ${meta.name} as a named \${secret:NAME} reference.`);
  if (given !== undefined) return given;
  if (meta.optional) return undefined;
  if (meta.secret)
    return `\${secret:${input.id.replaceAll("_", "-")}-${meta.name.replaceAll("_", "-")}}`;
  return defaultValue(meta);
}

function namedSecret(value: unknown): boolean {
  return typeof value === "string" && /^\$\{secret:[^}]+\}$/.test(value);
}

function defaultValue(meta: ConnectionChoice["settings"][number]): unknown {
  return meta.default ?? meta.values?.[0] ?? "REPLACE_ME";
}
