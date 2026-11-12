// One connection's section of the source request: what is already covered, the recipe's step
// with its placeholders filled, and the alternatives (spec/cli/sources.md, section 4, "Layout").
import type { SourceTable } from "@ingestron/definitions";
import { byCodePoint } from "./changes.js";
import type { SourceAsk, SourceRecipe } from "./recipe.js";

/** A connection's section, and the import of each file it asks to be saved, as `<connection> <file>`. */
export interface SourceSection {
  text: string;
  imports: string[];
}

/** One connection, its flows' tables and its recipe, with the inputs it gives the recipe. */
export interface SectionInput {
  connection: string;
  tables: readonly SourceTable[];
  recipe?: SourceRecipe;
  inputs: Record<string, string>;
}

const schemasText =
  "the schemas to describe, each in single quotes and separated by commas, such as 'dbo', 'sales'";

/** The section for one connection. */
export function sourceSection(input: SectionInput): SourceSection {
  const { connection, tables, recipe } = input;
  const objects = [...new Set(tables.map((table) => table.object))];
  if (tables.length > 0 && tables.every((table) => table.entry !== undefined))
    return { text: covered(connection, tables), imports: [] };
  if (recipe === undefined)
    return {
      text: [
        `## ${connection}`,
        "No recipe describes this source. Send one of these:",
        alternatives(connection, objects, true),
      ].join("\n\n"),
      imports: [`${connection} sources/${connection}.columns.csv`],
    };
  const step = recipeStep({ ...input, recipe }, objects);
  return {
    text: [
      `## ${connection}`,
      ...step.parts,
      `### If that cannot be done\n\n${alternatives(connection, objects, recipe.kind !== "sample")}`,
    ].join("\n\n"),
    imports: step.saves.map((file) => `${connection} ${file}`),
  };
}

/** Every table is in the metadata already: each entry once, by its `object`. */
function covered(connection: string, tables: readonly SourceTable[]): string {
  const entries = new Map(tables.map(({ entry }) => [entry!.object, entry!]));
  const lines = [...entries.values()]
    .sort((a, b) => byCodePoint(a.object, b.object))
    .map(({ object, captured }) => {
      const date = String(captured.at).slice(0, 10);
      return `- \`${object}\`: ${captured.from}, captured ${date}`;
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

/** The text with each known placeholder filled; any other text in braces is left as written. */
function fill(text: string, values: Readonly<Record<string, string>>): string {
  return text.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (whole, name: string) =>
    Object.hasOwn(values, name) ? values[name]! : whole,
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
  for (const [, name] of shownText(recipe, eachObject).matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)) {
    if (Object.hasOwn(values, name!) || left.has(name!)) continue;
    const input = Object.hasOwn(recipe.inputs, name!) ? recipe.inputs[name!] : undefined;
    if (input !== undefined) left.set(name!, input.description);
    else if (name === "schemas") left.set(name, schemasText);
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

/** The recipe's step: who, access and recipe, what to run, call or save, and where. */
function recipeStep(
  input: SectionInput & { recipe: SourceRecipe },
  objects: readonly string[],
): { parts: string[]; saves: string[] } {
  const { connection, recipe, inputs } = input;
  const { save, how } = recipe.ask;
  const schemas = schemasOf(recipe, objects);
  const values = { ...inputs, connection, ...(schemas !== undefined && { schemas }) };
  const asked = askedOf(recipe.ask);
  const eachObject = [asked.text ?? "", save].some((text) => text.includes("{object}"));
  const parts = [header(recipe, values), asked.intro];
  if (eachObject) parts.push(...eachObjectList(asked.text, save, values, objects));
  else if (asked.text !== undefined)
    parts.push(`\`\`\`${asked.block}\n${fill(asked.text, values).replace(/\n+$/, "")}\n\`\`\``);
  if (how !== undefined) parts.push(fill(how, values));
  parts.push(...fillIn(recipe, values, eachObject));
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
  return items.length > 0 ? [items.join("\n")] : [];
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

/** The alternatives, for when the step cannot be done; a sample recipe's has no sample item. */
function alternatives(connection: string, objects: readonly string[], sample: boolean): string {
  const items = [
    ...(sample
      ? [
          `- A sample of each table, exported as CSV, JSON, JSON lines or Parquet and saved as \`sources/${connection}/<object>.<csv|json|jsonl|parquet>\`. A Parquet file's schema is enough. A CSV or JSON sample should hold a few rows of synthetic or non-sensitive data: Ingestron reads only the names and types, and copies no value.`,
          ...objects.map((object) => `  - \`sources/${connection}/${object}.csv\``),
        ]
      : []),
    `- A data contract (ODCS) for the tables, from the source's team, saved as \`sources/${connection}.odcs.yaml\`.`,
    `- The columns file, saved as \`sources/${connection}.columns.csv\`, with one row for each column and these fields, in order: \`table_catalog\`, \`table_schema\`, \`table_name\`, \`column_name\`, \`ordinal_position\`, \`data_type\`, \`is_nullable\` (\`YES\` or \`NO\`), \`primary_key_position\` (empty when the column is not in the key). A script, a catalog export or a spreadsheet can make it.`,
  ];
  return items.join("\n");
}
