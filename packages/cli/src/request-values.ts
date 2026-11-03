// The platform request's "Values to provide": each environment variable the definitions
// read, the values it feeds, and whether it is set, but never its value; and what the
// request leaves out while a flow's source is not known (spec/cli/request.md).
import type { EnvvarReference } from "@ingestron/config";
import type { ResolvedModel } from "@ingestron/definitions";

/** Each flow whose source holds an unset variable, by id, with its source as written. */
export function sourcesNotKnown(model: ResolvedModel): Map<string, string> {
  const flows = new Map<string, string>();
  for (const table of model.tables)
    if (table.sourceNotKnown !== undefined && table.origin.kind === "Flow")
      flows.set(table.origin.id, table.sourceNotKnown);
  return flows;
}

/** The section, or nothing when the definitions read no environment variable. */
export function valuesToProvide(
  references: readonly EnvvarReference[],
  environment: string | undefined,
  notKnown: Map<string, string>,
): string | undefined {
  if (references.length === 0) return undefined;
  const file = environment === undefined ? ".env" : `.env.${environment}`;
  const variables = byName(references);
  const unset = [...variables.values()].some((uses) => uses[0]?.setIn === undefined);
  return [
    "## Values to provide",
    "These values come from environment variables. Set them in the pipeline that runs " +
      `Ingestron for this environment, or in \`${file}\` on your own computer, kept out of Git.`,
    [...variables].map(([name, uses]) => `- ${line(name, uses)}`).join("\n"),
    ...(unset ? [notSetYet(notKnown)] : []),
  ].join("\n\n");
}

/** The references grouped by variable, in the order each was first referenced. */
function byName(references: readonly EnvvarReference[]): Map<string, EnvvarReference[]> {
  const variables = new Map<string, EnvvarReference[]>();
  for (const reference of references) {
    const uses = variables.get(reference.name);
    if (uses) uses.push(reference);
    else variables.set(reference.name, [reference]);
  }
  return variables;
}

/** One variable: the values it feeds, file by file, and where it is set. */
function line(name: string, uses: EnvvarReference[]): string {
  const files = new Map<string, string[]>();
  for (const use of uses) {
    const fields = files.get(use.file) ?? [];
    fields.push(`\`${field(use.pointer)}\``);
    files.set(use.file, fields);
  }
  const used = [...files].map(([file, fields]) => `${listed(fields)} in \`${file}\``);
  return `\`${name}\`, used for ${listed(used)}: ${setIn(uses[0]?.setIn)}.`;
}

/** The pointer's keys joined with dots, such as `values.landing`. */
function field(pointer: string): string {
  return pointer
    .split("/")
    .slice(1)
    .map((key) => key.replaceAll("~1", "/").replaceAll("~0", "~"))
    .join(".");
}

function setIn(where: string | undefined): string {
  if (where === undefined) return "not set yet";
  if (where === "host") return "set in the environment Ingestron runs in";
  return `set in \`${where}\``;
}

function listed(items: string[]): string {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** What the request shows for a variable not set yet, and what it leaves out without one. */
function notSetYet(notKnown: Map<string, string>): string {
  const flows = [...notKnown].map(
    ([flow, source]) =>
      `The source of flow \`${flow}\`, \`${source}\`, is not known yet, so nothing its tables need is listed.`,
  );
  return [
    "Until a variable is set, this request shows it as `${envvar:NAME}`, and leaves out " +
      "what cannot be worked out without it.",
    ...flows,
    ...(notKnown.size > 0
      ? ["Any SQL to run once is left out until every flow's source is known."]
      : []),
  ].join(" ");
}
