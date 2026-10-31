// Builds names from Liquid patterns (specification section 5).
import { Liquid } from "liquidjs";
import type { Context } from "./context.js";
import type { Source } from "./diagnostics.js";
import type { Naming } from "./pack.js";

/** A pattern and where it was written (none for the pack's default). */
export interface Pattern {
  text: string;
  at?: Source;
}

/** Values a pattern can use. Missing ones are empty, so `{% if source %}` works. */
export interface NameVariables {
  project: string;
  environment: string;
  layer?: string;
  table?: string;
  flow?: string;
  source?: string;
}

/** The names a pattern can use, with what each one holds. */
export const nameVariables: Record<keyof NameVariables, string> = {
  project: "The project's id, such as sales.",
  environment: "The environment's name, such as dev or prod.",
  layer: "The table's layer, such as bronze, silver or gold.",
  table: "The table's name in its flow or transform, such as orders.",
  flow: "The id of the table's flow, such as shop. Empty for a transform.",
  source: "The id of the flow's connection, such as shop. Empty for a transform.",
};

const known = new Set(Object.keys(nameVariables));
const validName = /^[a-z_][a-z0-9_]*$/;
const engine = new Liquid({ strictFilters: true });

/** The pattern for each name: the pack's, then the standard's, then the platform's. */
export function namePatterns(context: Context): Record<keyof Naming, Pattern> {
  const keys = Object.keys(context.pack.defaults.naming) as (keyof Naming)[];
  return Object.fromEntries(keys.map((key) => [key, patternFor(context, key)])) as Record<
    keyof Naming,
    Pattern
  >;
}

function patternFor(context: Context, key: keyof Naming): Pattern {
  for (const document of [context.platform, context.standard]) {
    const text = document?.value.naming?.[key];
    if (document && text !== undefined)
      return { text, at: { document, pointer: `/naming/${key}` } };
  }
  return { text: context.pack.defaults.naming[key] };
}

/** The rendered name, or undefined after reporting why it cannot be used. */
export function renderName(
  context: Context,
  pattern: Pattern,
  variables: NameVariables,
): string | undefined {
  let name: string;
  try {
    const template = engine.parse(pattern.text);
    const unknown = engine.globalVariablesSync(template).filter((variable) => !known.has(variable));
    if (unknown.length > 0)
      throw new Error(`unknown variable ${unknown.join(", ")}; use ${[...known].join(", ")}`);
    name = engine.renderSync(template, variables) as string;
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message.split("\n")[0] : String(cause);
    context.reporter.error("BAD_PATTERN", `Name pattern "${pattern.text}": ${reason}.`, pattern.at);
    return undefined;
  }
  if (!validName.test(name)) {
    const hint =
      'Names use lower-case letters, digits and "_"; filters such as "| downcase" and "| replace: \'-\', \'_\'" help.';
    context.reporter.error(
      "BAD_NAME",
      `Name pattern "${pattern.text}" gives "${name}", which is not a valid name.`,
      pattern.at,
      hint,
    );
    return undefined;
  }
  return name;
}
