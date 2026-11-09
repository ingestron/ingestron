// What a REPLACE_ME stands for: the field it fills, where to find the value, and a
// suggestion. A kit's skeleton leaves the team's own values as REPLACE_ME.
import { packs } from "@ingestron/core";
import { platformSectionReference, type FieldInfo } from "@ingestron/definitions";
import { fieldAt } from "../assist/index.js";
import { placeAt } from "../navigation/index.js";
import type { Project } from "../project/index.js";
import { allSpots, type Spot } from "../project/index.js";
import type { HoverOptions } from "./explain.js";
import { shown } from "./hover.js";

/**
 * What a `REPLACE_ME` stands for: the field it fills and the help the field gives.
 * @public
 */
export interface ReplaceMeHelp {
  /** The field's name, such as `warehouse_id`. */
  field: string;
  description?: string;
  /** Where the owner finds the value. */
  find?: string;
  /** What the value could look like; the field's example, written as text, when it has no suggestion. */
  suggest?: string;
  /** The field's page in the reference, such as `/docs/reference/packs/databricks#platform-warehouse-id`. */
  docs: string;
}

/**
 * Explains the `REPLACE_ME` at `pointer` (a JSON Pointer) in `file`, a path in the project: the
 * field it fills, where to find the value and a suggestion. An item of a list, such as
 * `/alerts/0/to/0`, is explained by the list's items, named by the list. For a `values.<name>` in
 * project.yaml, the field is the one that reads `${values.<name>}` as its whole value, else the
 * first that contains it. Undefined when no field describes the spot.
 */
export function replaceMeHelp(
  project: Project,
  file: string,
  pointer: string,
  environment: string | undefined,
): ReplaceMeHelp | undefined {
  const field = fieldFor(project, file, pointer, environment);
  if (!field) return undefined;
  const suggest = suggestion(field);
  return {
    field: fieldName(field),
    ...(field.description && { description: field.description }),
    ...(field.find && { find: field.find }),
    ...(suggest && { suggest: suggest.text }),
    docs: field.docs,
  };
}

/** The hover for a `REPLACE_ME` value, or undefined when no field describes it. */
export function explainReplaceMe(
  project: Project,
  file: string,
  pointer: string,
  environment: string | undefined,
  { docs = (link) => link }: HoverOptions,
): string | undefined {
  const field = fieldFor(project, file, pointer, environment);
  if (!field) return undefined;
  const suggest = suggestion(field);
  return [
    `**${fieldName(field)}** still needs a value.`,
    field.description,
    field.find && `Where to find it: ${field.find}`,
    suggest && `${suggest.kind}: \`${suggest.text}\`.`,
    `[Reference](${docs(field.docs)})`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** The field's name; an item of a list, described as `*`, is named by its list. */
function fieldName(field: FieldInfo): string {
  return field.name === "*"
    ? (field.path.findLast((key) => key !== "*") ?? field.name)
    : field.name;
}

/** A suggestion, else the example as text. */
function suggestion(field: FieldInfo): { kind: string; text: string } | undefined {
  if (field.suggest) return { kind: "Suggested", text: field.suggest };
  if (field.example !== undefined) return { kind: "For example", text: shown(field.example) };
  return undefined;
}

function fieldFor(
  project: Project,
  file: string,
  pointer: string,
  environment: string | undefined,
): FieldInfo | undefined {
  const text = project.files.read(file);
  if (text === undefined) return undefined;
  const segments = pointer
    .split("/")
    .slice(1)
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
  const name = projectValue(file, segments);
  if (name === undefined) return describedAt(project, file, text, segments, environment);
  const reads = readers(project, name);
  for (const found of reads) {
    const field = describedAt(project, found.file, found.text, found.spot.segments, environment);
    if (field) return field;
  }
  return undefined;
}

/** The name of a project.yaml `values` entry, top or under an environment. */
function projectValue(file: string, segments: string[]): string | undefined {
  if (file !== "project.yaml") return undefined;
  const [first, , third] = segments;
  const top = segments.length === 2 && first === "values";
  const inEnvironment = segments.length === 4 && first === "environments" && third === "values";
  return top || inEnvironment ? segments.at(-1) : undefined;
}

interface Reader {
  file: string;
  text: string;
  spot: Spot;
}

/** Values that read `${values.<name>}`: those that are only that first, then those that contain it, each in file order. */
function readers(project: Project, name: string): Reader[] {
  const reference = `\${values.${name}}`;
  const all = project.files
    .list()
    .filter((file) => /\.ya?ml$/.test(file))
    .flatMap((file) => {
      const text = project.files.read(file) ?? "";
      return allSpots(text)
        .filter((spot) => spot.part === "value" && spot.text.includes(reference))
        .filter((spot) => file !== "project.yaml" || !spot.segments.includes("values"))
        .map((spot) => ({ file, text, spot }));
    });
  return [
    ...all.filter((item) => item.spot.text === reference),
    ...all.filter((item) => item.spot.text !== reference),
  ];
}

/** The field the value at `segments` fills: a document's own, a method's setting or a pack's Platform section. */
function describedAt(
  project: Project,
  file: string,
  text: string,
  segments: string[],
  environment: string | undefined,
): FieldInfo | undefined {
  const spot = allSpots(text).find(
    (item) =>
      item.part === "value" &&
      item.segments.length === segments.length &&
      item.segments.every((segment, index) => segment === segments[index]),
  );
  if (!spot) return undefined;
  const place = placeAt(file, text, spot.range[0]);
  return (
    fieldAt(project, place, segments, environment) ??
    (place.kind === "Platform" ? sectionField(segments) : undefined)
  );
}

/** A field of a pack's section of the Platform, written under the pack's id. */
function sectionField(segments: string[]): FieldInfo | undefined {
  const pack = packs.find((item) => item.id === segments[0]);
  return pack && platformSectionReference(pack).find((field) => same(field.path, segments));
}

/** Described keys match when each is the same or the description says `*`. */
function same(described: string[], path: string[]): boolean {
  return (
    described.length === path.length &&
    described.every((key, index) => key === "*" || key === path[index])
  );
}
