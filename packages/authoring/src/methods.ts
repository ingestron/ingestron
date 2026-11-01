// A method at a place: its name under settings or fixed, or the value of a
// `uses` or a rule's `use`. With what it does, its settings, and which tables
// use it and what chose it, so a method that no file names is explained.
import { packs } from "@ingestron/cli";
import { methodReference, type ChosenBy, type FieldInfo } from "@ingestron/definitions";
import type { Place } from "./context.js";
import { settingsAt } from "./fields.js";
import { resolved, type Project } from "./project.js";
import type { Spot } from "./yaml.js";

/** What the editor shows about one method. */
export interface MethodInfo {
  id: string;
  pack: string;
  action: string;
  description: string;
  facts: { label: string; value: string }[];
  settings: FieldInfo[];
  /** Each table that uses it in the environment, and what chose it, or why that is not known. */
  usedBy: string[];
  docs: string;
}

/** The method named at the spot, if any. */
export function methodAt(
  project: Project,
  place: Place,
  spot: Spot,
  environment: string | undefined,
): string | undefined {
  if (spot.part === "value" && /^(uses|use)$/.test(spot.segments.at(-1) ?? "")) return spot.text;
  if (spot.part !== "key") return undefined;
  const settings = settingsAt(project, place, spot.segments, environment);
  return settings && settings.rest.length === 0 ? settings.method : undefined;
}

/** What the method does, its settings, and its use in the project. */
export function methodInfo(
  project: Project,
  id: string,
  environment: string | undefined,
): MethodInfo | undefined {
  const pack = packs.find((candidate) => candidate.methods[id]);
  const method = pack?.methods[id];
  if (!pack || !method) return undefined;
  const facts = [
    method.connectors && { label: "Reads", value: method.connectors.join(", ") },
    method.connectivity && { label: "Connectivity", value: method.connectivity.join(", ") },
    method.accepts && { label: "Accepts", value: method.accepts.join(", ") },
    { label: "Hands over", value: method.produces },
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact));
  const usedBy = usesOf(project, id, environment);
  return {
    id,
    pack: pack.id,
    action: method.action,
    description: method.description,
    facts,
    settings: methodReference(pack, id).filter((field) => field.path.length === 1),
    docs: `/docs/reference/packs/${pack.id}#${id}`,
    usedBy: usedBy ?? ["Fix the project's problems to see which tables use it."],
  };
}

function usesOf(
  project: Project,
  id: string,
  environment: string | undefined,
): string[] | undefined {
  const { model } = resolved(project, environment);
  if (!model) return undefined;
  return model.tables.flatMap((table) =>
    (["ingest", "transform", "store", "serve"] as const).flatMap((action) => {
      const step = table[action];
      return step?.method === id
        ? [`\`${table.name}\` (${action}): chosen by ${chosenByText(step.chosenBy)}`]
        : [];
    }),
  );
}

/** How a method was chosen, in words. */
export function chosenByText({ by, when, pack, file, line, replaced }: ChosenBy): string {
  const facts = Object.entries(when ?? {})
    .map(([key, value]) => `\`${key}: ${String(value)}\``)
    .join(" and ");
  const where = file ? ` (${file}:${line})` : "";
  const words = {
    definition: "its own `uses`",
    "standard-rule": `the standard's rule for ${facts}`,
    "standard-default": "the standard's default",
    "pack-rule": `the ${pack} pack's rule for ${facts}`,
    "pack-default": `the ${pack} pack's default`,
    "runs-on": `the environment, which runs on ${pack}${replaced ? `, in place of ${replaced}` : ""}`,
  };
  return `${words[by]}${where}`;
}
