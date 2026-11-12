// One connection's section of the source request: what is already covered, the recipe's step
// with its placeholders filled, and the alternatives (spec/cli/sources.md, section 4, "Layout").
import type { SourceTable } from "@ingestron/definitions";
import { columnsFileFields } from "../source-text.js";
import { byCodePoint } from "../code-point.js";
import type { SourceAsk, SourceRecipe } from "./recipe.js";

/** A connection's section, and the import of each file it asks to be saved, as `[<connection>, <file>]`. */
export interface SourceSection {
  text: string;
  imports: [string, string][];
}

/** One connection, its flows' tables and its recipe, with the inputs it gives the recipe. */
export interface SectionInput {
  connection: string;
  tables: readonly SourceTable[];
  recipe?: SourceRecipe;
  inputs: Record<string, string>;
  /** The project guide has its source metadata part, so the assistant's columns file is offered. */
  assistant?: boolean;
}

/** What to write for each placeholder the request fills in itself, when it cannot. */
const leftText: Record<string, string> = {
  schemas:
    "the schemas to describe, each in single quotes and separated by commas, such as 'dbo', 'sales'",
  object: "a table to describe, as a flow's object names it; do this once for each table",
};

/** The section for one connection. */
export function sourceSection(input: SectionInput): SourceSection {
  const { connection, tables, recipe, assistant = false } = input;
  const objects = [...new Set(tables.map((table) => table.object))];
  if (tables.length > 0 && tables.every((table) => table.entry !== undefined))
    return { text: covered(connection, tables), imports: [] };
  if (recipe === undefined)
    return {
      text: [
        `## ${connection}`,
        "No recipe describes this source. Send one of these:",
        alternatives(connection, objects, true, assistant),
      ].join("\n\n"),
      imports: [[connection, `sources/${connection}.columns.csv`]],
    };
  const step = recipeStep({ ...input, recipe }, objects);
  return {
    text: [
      `## ${connection}`,
      ...step.parts,
      `### If that cannot be done\n\n${alternatives(connection, objects, recipe.kind !== "sample", assistant)}`,
    ].join("\n\n"),
    imports: step.saves.map((file): [string, string] => [connection, file]),
  };
}

/** Every table is in the metadata already: each entry once, by its `object`. */
function covered(connection: string, tables: readonly SourceTable[]): string {
  const entries = new Map(tables.map(({ entry }) => [entry!.object, entry!]));
  const lines = [...entries.values()]
    .sort((a, b) => byCodePoint(a.object, b.object))
    .map(({ object, captured }) => {
      const date = /^\d{4}-\d{2}-\d{2}(?![0-9])/.exec(String(captured.at))?.[0];
      return `- \`${object}\`: ${captured.from}${date === undefined ? "" : `, captured ${date}`}`;
    });
  return [
    `## ${connection}`,
    `Every table its flows read is in sources/${connection}.yaml:`,
    lines.join("\n"),
  ].join("\n\n");
}

/** The schemas the tables read, each as a SQL literal, or undefined when they are not known. */
function schemasOf(recipe: SourceRecipe, objects: readonly string[]): string | undefined {
  if ((recipe.names?.parts ?? 0) < 2 || objects.length === 0) return undefined;
  const schemas = objects.map((object) => {
    const parts = object.split(".");
    return parts.length < 2 ? undefined : parts[parts.length - 2];
  });
  if (schemas.some((schema) => schema === undefined || schema.includes("${"))) return undefined;
  return [...new Set(schemas as string[])]
    .sort(byCodePoint)
    .map((schema) => `'${schema.replaceAll("'", "''")}'`)
    .join(", ");
}

/**
 * The text with each known placeholder filled; any other text in braces is left as written. A
 * value that holds `{object}` has it filled too, when the values name a table.
 */
function fill(text: string, values: Readonly<Record<string, string>>): string {
  return text.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (whole, name: string) => {
    if (!Object.hasOwn(values, name)) return whole;
    const value = values[name]!;
    const object = values.object;
    return name === "object" || !object ? value : value.replaceAll("{object}", object);
  });
}

/** The inputs' defaults, for the ones the connection does not give. */
function defaultsOf(recipe: SourceRecipe): Record<string, string> {
  return Object.fromEntries(
    Object.entries(recipe.inputs).flatMap(([name, { default: given }]) =>
      given === undefined ? [] : [[name, given]],
    ),
  );
}

/** The step's text, in the order it is shown, before it is filled. */
function shownText(recipe: SourceRecipe, eachObject: boolean): string {
  const { who, access, run, call, how, save } = recipe.ask;
  const asked = run ?? call ?? "";
  return [who, access, asked, eachObject ? save : "", how ?? "", eachObject ? "" : save].join("\n");
}

/** `Fill in before use:` and its list, or nothing when every placeholder is filled. */
function fillIn(
  recipe: SourceRecipe,
  values: Readonly<Record<string, string>>,
  eachObject: boolean,
): string[] {
  const left = new Map<string, string>();
  const shown = fill(shownText(recipe, eachObject), values);
  for (const [, name] of shown.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)) {
    if (Object.hasOwn(values, name!) || left.has(name!)) continue;
    const input = Object.hasOwn(recipe.inputs, name!) ? recipe.inputs[name!] : undefined;
    if (input !== undefined) left.set(name!, input.description);
    else if (Object.hasOwn(leftText, name!)) left.set(name!, leftText[name!]!);
  }
  if (left.size === 0) return [];
  const lines = [...left].map(([name, what]) => `- \`{${name}}\`: ${what}`);
  return ["Fill in before use:", lines.join("\n")];
}

/** What a step asks for: a query, a URL or a sample, with the words each is shown with. */
function askedOf({ run, call }: SourceAsk): {
  text?: string;
  intro: string;
  block: string;
  saved: string;
} {
  if (run !== undefined)
    return { text: run, intro: "Run this query:", block: "sql", saved: "result" };
  if (call !== undefined)
    return { text: call, intro: "Call this URL:", block: "text", saved: "response" };
  return { intro: "Save a sample of each table:", block: "", saved: "result" };
}

/**
 * The values for the fill-in list of a step with one item for each table. The items fill `{object}`
 * and the block and save line leave it as written, so it is not listed; but text shown once
 * (who, access and how) leaves it as written too, so then it is.
 */
function withoutObject(
  { ask }: SourceRecipe,
  values: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const once = [ask.who, ask.access, ask.how ?? ""].some((text) =>
    fill(text, values).includes("{object}"),
  );
  return once ? values : { ...values, object: "" };
}

/** The recipe's step: who, access and recipe, what to run, call or save, and where. */
function recipeStep(
  input: SectionInput & { recipe: SourceRecipe },
  objects: readonly string[],
): { parts: string[]; saves: string[] } {
  const { connection, recipe, inputs } = input;
  const { save, how } = recipe.ask;
  const schemas = schemasOf(recipe, objects);
  const values = {
    ...defaultsOf(recipe),
    ...inputs,
    connection,
    ...(schemas !== undefined && { schemas }),
  };
  const asked = askedOf(recipe.ask);
  // With no tables, {object} is left as written in the block and the save line.
  const eachObject =
    objects.length > 0 && [asked.text ?? "", save].some((text) => text.includes("{object}"));
  const parts = [header(recipe, values), asked.intro];
  if (eachObject) parts.push(...eachObjectList(asked.text, save, values, objects));
  else if (asked.text !== undefined)
    parts.push(`\`\`\`${asked.block}\n${fill(asked.text, values).replace(/\n+$/, "")}\n\`\`\``);
  if (how !== undefined) parts.push(fill(how, values).trim());
  parts.push(...fillIn(recipe, eachObject ? withoutObject(recipe, values) : values, eachObject));
  if (eachObject)
    return { parts, saves: objects.map((object) => fill(save, { ...values, object })) };
  parts.push(`Save the ${asked.saved} as \`${fill(save, values)}\`.`);
  return { parts, saves: [fill(save, values)] };
}

/** One item for each table: what to run or call for it, and where to save it. */
function eachObjectList(
  asked: string | undefined,
  save: string,
  values: Readonly<Record<string, string>>,
  objects: readonly string[],
): string[] {
  const items = objects.map((object) => {
    const filled = { ...values, object };
    const where = `\`${fill(save, filled)}\``;
    return asked === undefined ? `- ${where}` : `- \`${fill(asked, filled)}\`, saved as ${where}`;
  });
  return [items.join("\n")];
}

/** Who, the access and the recipe, naming a project recipe's file. */
function header(recipe: SourceRecipe, values: Readonly<Record<string, string>>): string {
  const file = `recipes/${recipe.id}.yaml`;
  const from = recipe.file === file ? `, from \`${file}\`` : "";
  return [
    `- Who: ${fill(recipe.ask.who, values)}`,
    `- Access: ${fill(recipe.ask.access, values)}`,
    `- Recipe: ${recipe.title} (\`${recipe.id}\`${from})`,
  ].join("\n");
}

/**
 * The alternatives, for when the step cannot be done; a sample recipe's has no sample item, and
 * the assistant's columns file comes last when the project guide offers it.
 */
function alternatives(
  connection: string,
  objects: readonly string[],
  sample: boolean,
  assistant: boolean,
): string {
  const items = [
    ...(sample
      ? [
          `- A sample of each table, exported as CSV, JSON, JSON lines or Parquet and saved as \`sources/${connection}/<object>.<csv|json|jsonl|parquet>\`. A Parquet file's schema is enough. A CSV or JSON sample should hold a few rows of synthetic or non-sensitive data: Ingestron reads only the names and types, and copies no value.`,
          ...objects.map((object) => `  - \`sources/${connection}/${object}.csv\``),
        ]
      : []),
    `- A data contract (ODCS) for the tables, from the source's team, saved as \`sources/${connection}.odcs.yaml\`.`,
    `- The columns file, saved as \`sources/${connection}.columns.csv\`, with one row for each column and these fields, in order: ${columnsFileFields}. A script, a catalog export or a spreadsheet can make it.`,
    ...(assistant
      ? [
          `- Or ask the coding assistant this project's guide sets up to prepare the columns file from whatever you have (a data dictionary, a spreadsheet, API responses), saved as \`sources/${connection}.assistant.csv\`. Check it with \`ingestron source import ${connection} sources/${connection}.assistant.csv --dry-run\`.`,
        ]
      : []),
  ];
  return items.join("\n");
}
