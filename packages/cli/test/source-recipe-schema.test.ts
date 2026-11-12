// The editor schema of a source recipe against the recipes that readSourceRecipe accepts and the
// ones it refuses (spec/cli/sources.md, section 1): a differential test with a second validator.
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { installedSourceRecipes, readSourceRecipe, sourceRecipeSchema } from "@ingestron/core";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const conformance = resolve(import.meta.dirname, "../../../spec/cli/conformance/sources/recipes");
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(sourceRecipeSchema);

/** Every recipe of the folder, as its name and text. */
function recipesIn(folder: string): { name: string; text: string }[] {
  return readdirSync(folder)
    .filter((name) => /^[^.].*\.yaml$/.test(name))
    .map((name) => ({ name, text: readFileSync(join(folder, name), "utf8") }));
}

/** What the schema says about the recipe's text. */
function schemaAccepts(text: string): boolean {
  return validate(parse(text));
}

/** A fixture's text with the first occurrence of each pair's first text replaced. */
function edited(name: string, ...edits: [string, string][]): string {
  let text = readFileSync(join(conformance, `${name}.yaml`), "utf8");
  for (const [from, to] of edits) {
    if (!text.includes(from)) throw new Error(`"${from}" is not in ${name}.yaml.`);
    text = text.replace(from, to);
  }
  return text;
}

describe("the recipe schema", () => {
  const installed = installedSourceRecipes().map(({ file }) => ({
    name: file,
    text: readFileSync(file, "utf8"),
  }));

  for (const { name, text } of recipesIn(conformance))
    it(`accepts the conformance recipe ${name}, as readSourceRecipe does`, () => {
      expect(() => readSourceRecipe(text, name)).not.toThrow();
      expect(schemaAccepts(text), JSON.stringify(validate.errors)).toBe(true);
    });

  // The installed catalog, when the standards package in use has one.
  for (const { name, text } of installed)
    it(`accepts the installed recipe ${name}, as readSourceRecipe does`, () => {
      expect(() => readSourceRecipe(text, name)).not.toThrow();
      expect(schemaAccepts(text), JSON.stringify(validate.errors)).toBe(true);
    });

  const broken: [string, string][] = [
    ["an unknown key", edited("sqlserver", ["title:", "colour: red\ntitle:"])],
    ["a kind that is not one", edited("sqlserver", ["kind: catalog", "kind: query"])],
    ["a reader that is not one", edited("sqlserver", ["read: columns", "read: csv"])],
    ["an id with a capital", edited("sqlserver", ["id: sqlserver", "id: SQLServer"])],
    ["a save outside sources", edited("sqlserver", ["save: sources/", "save: output/"])],
    ["a source that is not https", edited("sqlserver", ["https://", "http://"])],
    [
      "a source date that is not a date",
      edited("sqlserver", ["read: 2026", "read: yesterday-2026"]),
    ],
    ["names.parts out of range", edited("sqlserver", ["parts: 3", "parts: 9"])],
    [
      "a logical type that is not one",
      edited("sqlserver", ["logicalType: boolean", "logicalType: bool"]),
    ],
    ["an input name that is reserved", edited("sqlserver", ["  database:", "  object:"])],
    ["no sources", edited("sqlserver", ["sources:", "sources: []\nunused:"])],
  ];

  for (const [name, text] of broken)
    it(`refuses ${name}, as readSourceRecipe does`, () => {
      expect(() => readSourceRecipe(text, "recipes/sqlserver.yaml")).toThrow();
      expect(schemaAccepts(text)).toBe(false);
    });
});
