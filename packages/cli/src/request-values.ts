// The platform request's "Values to provide": each environment variable the definitions
// read, the values it feeds, and whether it is set, but never its value; what the request
// leaves out while one is not set; and the checks that wait for it (spec/cli/request.md).
import type { EnvvarReference } from "@ingestron/config";
import type { LeftOut, NotKnown } from "./request-unknown.js";

/** The section, or nothing when the definitions read no environment variable. */
export function valuesToProvide(
  references: readonly EnvvarReference[],
  environment: string | undefined,
  notKnown: NotKnown,
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
    ...(unset ? [notSetYet(notKnown), checksWait] : []),
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
function notSetYet({ sources, tables }: NotKnown): string {
  const flows = [...sources].map(
    ([flow, references]) =>
      `The source of flow \`${flow}\` holds ${notSet(references)}, so it is ` +
      "not known yet and nothing its tables need is listed.",
  );
  const leftOut = [...tables].map(
    ([table, why]) => `Table \`${table}\` is left out: ${reason(why)}.`,
  );
  const sql = sources.size > 0 ? "" : ", and so does any SQL to run once";
  return [
    "Until a variable is set, this request shows it as `${envvar:NAME}`, and leaves out " +
      "what cannot be worked out without it.",
    ...flows,
    ...leftOut,
    ...(tables.size > 0 ? [`The lists below leave these tables out${sql}.`] : []),
    ...(sources.size > 0
      ? ["Any SQL to run once is left out until every flow's source is known."]
      : []),
  ].join(" ");
}

function reason(why: LeftOut): string {
  if ("reads" in why) return `it reads \`${why.reads}\`, which is left out`;
  return `it is made from ${notSet(why.holds)}`;
}

/** The unset references, quoted, and that they are not set. */
function notSet(references: string[]): string {
  const quoted = listed(references.map((reference) => `\`${reference}\``));
  return `${quoted}, which ${references.length > 1 ? "are" : "is"} not set`;
}

/** The checks that need the whole project wait for every value (definitions specification, section 1). */
const checksWait =
  "Until every variable is set, some checks may not have run: each pack's checks of the " +
  "whole project, and each method's checks of a table that holds a variable not set. Once " +
  "the values are set, run `ingestron check` to run them.";
