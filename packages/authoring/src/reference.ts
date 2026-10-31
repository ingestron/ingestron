// The reference entry for the place under the cursor, for a panel beside the
// editor: the problems on that line with their meaning and fixes, then the
// field or value there, or else the document kind and its fields.
import { problemsAt, type ProblemEntry } from "./problems-at.js";
import { documentReference, referenceKinds, type FieldInfo } from "@ingestron/definitions";
import { placeAt, type Place } from "./context.js";
import { connectorOf, fieldAt, settingsAt } from "./fields.js";
import { methodAt, methodInfo, type MethodInfo } from "./methods.js";
import { shown } from "./hover.js";
import type { Project } from "./project.js";
import { contractUses } from "./contract-uses.js";
import { spotAt, type Spot } from "./yaml.js";

export type { ProblemEntry };

/** What the panel shows; every text is plain, with `code` in backticks. */
export interface ReferenceEntry {
  title: string;
  subtitle: string;
  text?: string;
  values?: { value: string; text?: string; current?: boolean }[];
  /** Short facts; `code` ones are values as written, such as a default. */
  facts?: { label: string; value: string; code?: boolean }[];
  /** For a document or method: its top-level fields or settings. */
  fields?: { name: string; text?: string; docs: string }[];
  /** The heading for `fields`, such as "Settings"; default "Fields". */
  fieldsHeading?: string;
  /** For a method: each table that uses it, and what chose it. */
  usedBy?: string[];
  /** For a contract field: what each of the project's packs does with it. */
  packs?: { pack: string; status: string; text: string }[];
  problems?: ProblemEntry[];
  docs?: string;
}

/** The entry for `offset` in `text`, the open text of `file`; undefined outside definitions. */
export function referenceAt(
  project: Project,
  file: string,
  text: string,
  offset: number,
  environment: string | undefined,
): ReferenceEntry | undefined {
  if (!/\.ya?ml$/.test(file)) return undefined;
  const entry = placeEntry(project, file, text, offset, environment);
  const found = problemsAt(project, file, text, offset, environment);
  if (!entry && found.length === 0) return undefined;
  const base = entry ?? { title: "Problems", subtitle: file };
  return found.length > 0 ? { ...base, problems: found } : base;
}

/** The field or value at the place, or the document when there is no field or it is the header. */
function placeEntry(
  project: Project,
  file: string,
  text: string,
  offset: number,
  environment: string | undefined,
): ReferenceEntry | undefined {
  const place = placeAt(file, text, offset);
  const spot = safeSpot(text, offset);
  // On a new list item there is no field yet: the list it is in is the place.
  if (!spot)
    return place.path.length > 0
      ? listEntry(project, place, environment)
      : documentEntry(place.kind);
  if (/^(apiVersion|kind)$/.test(spot.segments.join("/"))) return documentEntry(place.kind);
  const named = methodAt(project, place, spot, environment);
  const info = named && methodInfo(project, named, environment);
  return info ? methodEntry(info) : spotEntry(project, place, spot, environment);
}

/** The field at the spot; for a list item without its own description, the list's. */
function spotEntry(
  project: Project,
  place: Place,
  spot: Spot,
  environment: string | undefined,
): ReferenceEntry | undefined {
  const field = fieldAt(project, place, spot.segments, environment);
  if (!field && /^\d+$/.test(spot.segments.at(-1) ?? ""))
    return listEntry(project, { ...place, path: spot.segments.slice(0, -1) }, environment);
  if (!field) return documentEntry(place.kind);
  const method = settingsAt(project, place, spot.segments, environment)?.method;
  const connector =
    spot.segments[0] === "settings" ? connectorOf(place, project, environment) : undefined;
  const subtitle = method
    ? `Setting of ${method}`
    : connector
      ? `Setting of the ${connector.title} connector`
      : `Field of ${place.kind}`;
  const entry = fieldEntry(field, spot, subtitle);
  return place.kind === "DataContract" ? withPacks(project, entry, field, environment) : entry;
}

function listEntry(
  project: Project,
  place: Place,
  environment: string | undefined,
): ReferenceEntry | undefined {
  const field = fieldAt(project, place, place.path, environment);
  const spot = {
    part: "key" as const,
    segments: place.path,
    pointer: "",
    text: "",
    range: [0, 0] as [number, number],
  };
  if (!field) return documentEntry(place.kind);
  const entry = fieldEntry(field, spot, `Field of ${place.kind}`);
  return place.kind === "DataContract" ? withPacks(project, entry, field, environment) : entry;
}

/** A method's entry: what it does, its facts and settings, and the tables that use it. */
export function methodEntry(info: MethodInfo): ReferenceEntry {
  return {
    title: info.id,
    subtitle: `Method of the ${info.pack} pack (${info.action})`,
    text: info.description,
    facts: info.facts,
    fields: info.settings.map((field) => ({
      name: field.name,
      docs: field.docs,
      ...(field.description && { text: field.description }),
    })),
    fieldsHeading: "Settings",
    docs: info.docs,
    usedBy: info.usedBy,
  };
}

function withPacks(
  project: Project,
  entry: ReferenceEntry,
  field: FieldInfo,
  environment: string | undefined,
): ReferenceEntry {
  const packs = contractUses(project, field.path.join("."), environment);
  return packs.length > 0 ? { ...entry, packs } : entry;
}

const homes = {
  platform: "the platform",
  standard: "the standard",
  definition: "a flow or transform",
};

/** A field's entry: what it is, its values and facts; `spot` marks the value written. */
export function fieldEntry(field: FieldInfo, spot: Spot, subtitle: string): ReferenceEntry {
  const written = spot.part === "value" ? spot.text : undefined;
  const facts = [
    field.required && { label: "Required", value: "yes" },
    field.default !== undefined && { label: "Default", value: shown(field.default), code: true },
    field.example !== undefined && {
      label: "For example",
      value: shown(field.example),
      code: true,
    },
    field.placement && { label: "Usually in", value: homes[field.placement] },
  ].filter((fact): fact is { label: string; value: string; code?: boolean } => Boolean(fact));
  return {
    title: field.name,
    subtitle,
    docs: field.docs,
    ...(field.description && { text: field.description }),
    ...(field.values && {
      values: field.values.map(({ value, description }) => ({
        value: String(value),
        ...(description && { text: description }),
        ...(written === String(value) && { current: true }),
      })),
    }),
    ...(facts.length > 0 && { facts }),
  };
}

/** A document kind's entry, with its top-level fields. */
export function documentEntry(kind: string | undefined): ReferenceEntry | undefined {
  if (!kind || !(kind in referenceKinds)) return undefined;
  const name = kind as keyof typeof referenceKinds;
  const schema = referenceKinds[name].schema as { description?: string };
  const fields = documentReference(name)
    .filter((field) => field.path.length === 1)
    .map((field) => ({
      name: field.name,
      docs: field.docs,
      ...(field.description && { text: field.description }),
    }));
  return {
    title: kind,
    subtitle: "Document",
    fields,
    docs: `/docs/reference/documents#${kind.toLowerCase()}`,
    ...(schema.description && { text: schema.description }),
  };
}

function safeSpot(text: string, offset: number): Spot | undefined {
  try {
    return spotAt(text, offset);
  } catch {
    return undefined;
  }
}
