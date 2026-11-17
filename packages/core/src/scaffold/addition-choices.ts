// Standard-scoped discovery for independent connection and flow additions.
import {
  formatDiagnostics,
  resolveProject,
  type FileSource,
  type Project,
} from "@ingestron/config";
import { kinds, type Connector } from "@ingestron/definitions";
import { projectEnvironments } from "../generation/index.js";
import { packs } from "../packs/index.js";

/** A connector and ingestion method allowed by the project's standard. @public */
export interface ConnectionChoice {
  connector: string;
  title: string;
  method: string;
  connectivity: string[];
  settings: Connector["settings"];
}

/** Source and method choices for independently adding definitions. @public */
export interface ProjectAdditions {
  connectors: ConnectionChoice[];
  connections: { id: string; connector: string; connectivity: string }[];
  objects: Record<string, string[]>;
}

/** Load definitions without reading host or .env values into authoring choices. */
export function additionProject(files: FileSource, environment?: string): Project {
  const safe = {
    list: () => files.list().filter((path) => !/^\.env(?:$|\.)/.test(path)),
    read: (path: string) => (/^\.env(?:$|\.)/.test(path) ? undefined : files.read(path)),
  };
  environment ??= projectEnvironments(safe)[0]?.environment;
  const loaded = resolveProject(safe, {
    kinds: Object.values(kinds),
    ...(environment && { environment }),
    envvars: {},
    missingEnvvars: "information",
  });
  if (!loaded.ok) throw new Error(formatDiagnostics(loaded.diagnostics));
  return loaded.project;
}

/** Choices from the selected standard's installed packs; no network access or writes. @public */
export function projectAdditions(files: FileSource, environment?: string): ProjectAdditions {
  const project = additionProject(files, environment);
  const standard = project.all(kinds.standard)[0]?.value;
  if (!standard) throw new Error("Add a Standard to the project's imports first.");
  const named = standard.packs;
  const connectors = packs
    .filter((pack) => named.includes(`${pack.id}@${pack.version}`))
    .flatMap((pack) =>
      Object.entries(pack.methods).flatMap(([method, facts]) => {
        if (facts.action !== "ingest" || !allowed(standard, method)) return [];
        return (facts.connectors ?? []).flatMap((id) => {
          const connector =
            pack.connectors?.find((item) => item.id === id && item.method === method) ??
            packs.flatMap((item) => item.connectors ?? []).find((item) => item.id === id);
          if (!connector) return [];
          const settings =
            method === "duckdb-files"
              ? [{ name: "path", description: "Folder containing the source files." }]
              : connector.settings;
          return [
            {
              connector: id,
              title: connector.title,
              method,
              connectivity: facts.connectivity ?? ["public"],
              settings,
            },
          ];
        });
      }),
    );
  const connections = project.all(kinds.connection).map(({ value }) => value);
  return {
    connectors,
    connections,
    objects: sourceObjects(project, environment ?? projectEnvironments(files)[0]?.environment),
  };
}

function sourceObjects(project: Project, environment?: string): Record<string, string[]> {
  const objects: Record<string, string[]> = {};
  for (const { value } of project.all(kinds.sourceMetadata)) {
    if (value.environment && environment && value.environment !== environment) continue;
    objects[value.connection] = [
      ...new Set([
        ...(Object.hasOwn(objects, value.connection) ? objects[value.connection]! : []),
        ...value.tables.map((table) => table.object),
      ]),
    ].sort();
  }
  return objects;
}

/** Standard method allow-lists apply before a source is offered. */
function allowed(standard: { ingest?: { allowed?: string[] } }, method: string): boolean {
  return !standard.ingest?.allowed || standard.ingest.allowed.includes(method);
}
