// An imported source object is a definition in SourceMetadata, including names with spaces.
import { allSpots, resolvedForDisplay, spotAt, type Project, type Spot } from "../project/index.js";
import type { Place } from "./navigation.js";

/** The imported object under the cursor, resolved without reading environment secrets. */
export function sourceDefinition(
  project: Project,
  file: string,
  offset: number,
  environment?: string,
): Place | undefined {
  try {
    return findSourceDefinition(project, file, offset, environment);
  } catch {
    return undefined;
  } // Incomplete YAML is normal while editing.
}

function findSourceDefinition(
  project: Project,
  file: string,
  offset: number,
  environment?: string,
): Place | undefined {
  if (!/\.ya?ml$/.test(file)) return undefined;
  const text = project.files.read(file) ?? "";
  const spots = allSpots(text);
  const value = (pointer: string) =>
    spots.find((item) => item.pointer === pointer && item.part === "value")?.text;
  if (value("/kind") !== "Flow") return undefined;
  const spot = spotAt(text, offset);
  if (!objectSpot(spot)) return undefined;
  const tables =
    resolvedForDisplay(project, environment ?? project.environments[0]).sourceTables ?? [];
  const table = tables.find(
    (item) => item.flow === value("/id") && item.table === spot.segments[1],
  );
  if (!table?.entry || !table.file) return undefined;
  return metadataPlace(project, table.file, table.entry.object);
}

function objectSpot(spot: Spot | undefined): spot is Spot {
  return spot?.part === "value" && /^\/tables\/[^/]+\/object$/.test(spot.pointer);
}
function metadataPlace(project: Project, file: string, object: string): Place | undefined {
  const target = allSpots(project.files.read(file) ?? "").find(
    (item) =>
      item.part === "value" && /^\/tables\/\d+\/object$/.test(item.pointer) && item.text === object,
  );
  return target ? { file, range: target.range } : undefined;
}
