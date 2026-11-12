// What completion from the source metadata reads: a connection's metadata tables in the order
// the project loads its documents, and every flow table with its entry, each also while the value
// at the cursor is not yet typed, which a placeholder there stands in for.
import type { SourceTable, SourceTableDoc } from "@ingestron/definitions";
import { documentOf, idsOf, type Place } from "../navigation/index.js";
import { documentsOf, resolved, type Project } from "../project/index.js";

/**
 * The tables of the metadata document of a connection, none when it has no document: the first
 * such document in the order the project loads them, as the definitions use.
 */
export function metadataTables(
  project: Project,
  place: Place,
  connection: string,
  environment: string | undefined,
): SourceTableDoc[] {
  const document = metadataDocuments(project, place, environment).find(
    (value) => value.connection === connection,
  );
  if (!Array.isArray(document?.tables)) return [];
  return (document.tables as (SourceTableDoc | null)[]).filter(
    (table): table is SourceTableDoc =>
      typeof table?.object === "string" && Array.isArray(table.columns),
  );
}

/**
 * The metadata documents in the order the project loads them. A value not yet typed (`object:`)
 * is null, which the schema refuses, so when the project does not load it is loaded again with a
 * placeholder at the cursor; when it still does not (an opening quote not yet closed), the
 * documents are taken in the order of their files.
 */
function metadataDocuments(
  project: Project,
  place: Place,
  environment: string | undefined,
): Record<string, unknown>[] {
  const loaded = documentsOf(project, environment);
  const documents =
    loaded.length > 0 ? loaded : documentsOf(typedOver(project, place), environment);
  if (documents.length === 0)
    return idsOf(project, "SourceMetadata").flatMap((id): Record<string, unknown>[] => {
      const document = documentOf(project, "SourceMetadata", id);
      return document ? [document] : [];
    });
  return documents
    .filter(({ kind }) => kind === "SourceMetadata")
    .map(({ value }) => value as Record<string, unknown>);
}

/**
 * Every flow table with its metadata entry. A value not yet typed (`check:`, `name:`) is null,
 * which the schema refuses, and a project that does not load lists nothing; so when it does not
 * load, it is resolved again with a placeholder at the cursor, as a first letter would make it.
 */
export function sourceTablesAt(
  project: Project,
  place: Place,
  environment: string | undefined,
): SourceTable[] {
  const listed = resolved(project, environment).sourceTables;
  if (listed) return listed;
  return resolved(typedOver(project, place), environment).sourceTables ?? [];
}

const typedProjects = new WeakMap<Project, Map<string, Project>>();

/**
 * The project with a placeholder written at the cursor, once per project snapshot, file, offset
 * and length of the text.
 */
function typedOver(project: Project, place: Place): Project {
  let byPlace = typedProjects.get(project);
  if (!byPlace) typedProjects.set(project, (byPlace = new Map()));
  const at = place.before.length;
  const key = `${place.file}:${at}:${place.text.length}`;
  let found = byPlace.get(key);
  if (!found) {
    const text = `${place.text.slice(0, at)}${place.before.endsWith(":") ? " " : ""}_${place.text.slice(at)}`;
    const files = {
      ...project.files,
      read: (path: string) => (path === place.file ? text : project.files.read(path)),
      size: (path: string) =>
        path === place.file ? Buffer.byteLength(text) : project.files.size?.(path),
    };
    byPlace.set(key, (found = { ...project, files }));
  }
  return found;
}
