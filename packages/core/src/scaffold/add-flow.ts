// Flows select an existing connection and objects; platform/standard settings stay untouched.
import type { FileSource } from "@ingestron/config";
import { kinds } from "@ingestron/definitions";
import { stringify } from "yaml";
import { additionProject, projectAdditions } from "./addition-choices.js";
import { checkNewId, includedDraft, type DefinitionDraft } from "./add-connection.js";
import { projectId } from "./scaffold.js";

/** The source objects of an independent flow. @public */
export interface AddFlow {
  id: string;
  connection: string;
  objects: string[];
  method?: string;
  environment?: string;
}

/** Draft a flow for an existing connection, preserving complete source object names. @public */
export function draftFlow(files: FileSource, input: AddFlow): DefinitionDraft {
  const project = additionProject(files, input.environment);
  checkNewId(
    input.id,
    "flow",
    project.all(kinds.flow).map(({ value }) => value.id),
  );
  const choices = projectAdditions(files, input.environment);
  const connection = choices.connections.find((item) => item.id === input.connection);
  if (!connection)
    throw new Error(`Unknown connection ${input.connection}. Add the connection first.`);
  const methods = [
    ...new Set(
      choices.connectors
        .filter(
          (item) =>
            item.connector === connection.connector &&
            item.connectivity.includes(connection.connectivity),
        )
        .map((item) => item.method),
    ),
  ];
  const method = input.method ?? (methods.length === 1 ? methods[0] : undefined);
  if (!method || !methods.includes(method))
    throw new Error(
      `Choose a supported ingestion method with --method: ${methods.join(", ") || "none"}.`,
    );
  const tables = flowTables(input.objects);
  const value = {
    apiVersion: "ingestron.io/v1",
    kind: "Flow",
    id: input.id,
    source: input.connection,
    ingest: { uses: method },
    tables,
  };
  return includedDraft(files, `flows/${input.id}.yaml`, stringify(value), input.environment);
}

function flowTables(objects: string[]): Record<string, { object: string }> {
  if (objects.length === 0 || objects.some((object) => object.trim() === ""))
    throw new Error("Choose at least one source object.");
  const tables: Record<string, { object: string }> = {};
  for (const object of new Set(objects)) {
    const id = projectId(object.split(".").at(-1)!);
    if (Object.hasOwn(tables, id))
      throw new Error(
        `Source objects share the table id ${id}. Add them as separate flows or edit table ids explicitly.`,
      );
    tables[id] = { object };
  }
  return tables;
}
