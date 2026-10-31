// Hover text for a described field or a method: what it is, its values,
// default, example and usual place, or for a method which tables use it and
// what chose it; each with a link to its reference.
import type { FieldInfo } from "@ingestron/definitions";
import type { Place } from "./context.js";
import { contractUses } from "./contract-uses.js";
import { fieldAt } from "./fields.js";
import { shown } from "./hover.js";
import type { MethodInfo } from "./methods.js";
import type { Project } from "./project.js";
import type { Spot } from "./yaml.js";

/** How the editor shows documentation links. */
export interface HoverOptions {
  /** A full URL for a docs path such as `/docs/reference/errors#SCHEMA`. */
  docs?: (link: string) => string;
}

/** The described field at the spot, explained; undefined when nothing describes it. */
export function explainField(
  project: Project,
  place: Place,
  spot: Spot,
  environment: string | undefined,
  options: HoverOptions,
): string | undefined {
  const field = fieldAt(project, place, spot.segments, environment);
  if (!field) return undefined;
  const packs =
    place.kind === "DataContract" ? contractUses(project, field.path.join("."), environment) : [];
  const inProject = packs.map(({ pack, status, text }) => `- **${pack}**: ${status}. ${text}`);
  return [fieldText(field, spot, options), inProject.join("\n")].filter(Boolean).join("\n\n");
}

/** A method: what it does, which tables use it and what chose it, and its page. */
export function methodText(info: MethodInfo, { docs = (link) => link }: HoverOptions): string {
  const used =
    info.usedBy.length > 0
      ? `Used by:\n${info.usedBy.map((use) => `- ${use}`).join("\n")}`
      : "No table uses it in this environment.";
  return [`**${info.id}**: ${info.description}`, used, `[Reference](${docs(info.docs)})`]
    .filter(Boolean)
    .join("\n\n");
}

const homes = {
  platform: "Usually set in the platform.",
  standard: "Usually set in the standard.",
  definition: "Usually set in a flow or transform.",
};

/** A described field: on its key everything, on its value that value's meaning. */
function fieldText(field: FieldInfo, spot: Spot, { docs = (link) => link }: HoverOptions): string {
  const chosen =
    spot.part === "value"
      ? field.values?.find((item) => String(item.value) === spot.text)
      : undefined;
  const body = chosen
    ? [`\`${spot.text}\`: ${chosen.description ?? ""}`.trim()]
    : aboutField(field);
  return [
    `**${field.name}**: ${field.description ?? ""}`.trim(),
    ...body,
    `[Reference](${docs(field.docs)})`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Every allowed value with its meaning, the default, an example and where it is usually set. */
function aboutField(field: FieldInfo): (string | undefined)[] {
  const values = (field.values ?? [])
    .filter((item) => item.description)
    .map((item) => `- \`${String(item.value)}\`: ${item.description}`);
  return [
    values.join("\n"),
    field.default !== undefined ? `Default: \`${shown(field.default)}\`.` : undefined,
    field.example !== undefined ? `For example: \`${shown(field.example)}\`.` : undefined,
    field.placement && homes[field.placement],
  ];
}
