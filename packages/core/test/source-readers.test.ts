// Source readers: the conformance cases in spec/cli/conformance/sources/readers/cases.json.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readSourceRecipe, type SourceRecipe } from "../src/sources/index.js";
import { readSourceFile } from "../src/sources/read-file.js";

interface Case {
  name: string;
  file: string;
  input: string;
  recipe?: string | { from: string; set: Partial<SourceRecipe> };
  object?: string;
  connection?: string;
  expected?: unknown;
  refused?: string[];
  forbidden?: string[];
}

const conformance = resolve(import.meta.dirname, "../../../spec/cli/conformance/sources");
const cases = JSON.parse(readFileSync(join(conformance, "readers/cases.json"), "utf8")) as {
  cases: Case[];
};

function recipeOf(choice: Case["recipe"]): SourceRecipe | undefined {
  if (choice === undefined) return undefined;
  const name = typeof choice === "string" ? choice : choice.from;
  const file = `recipes/${name}.yaml`;
  const recipe = readSourceRecipe(readFileSync(join(conformance, file), "utf8"), file);
  return typeof choice === "string" ? recipe : { ...recipe, ...choice.set };
}

describe("readSourceFile: the conformance cases", () => {
  for (const item of cases.cases) {
    it(item.name, () => {
      const result = readSourceFile({
        file: item.file,
        contents: new Uint8Array(readFileSync(join(conformance, "readers", item.input))),
        ...(item.recipe !== undefined && { recipe: recipeOf(item.recipe) }),
        ...(item.object !== undefined && { object: item.object }),
        ...(item.connection !== undefined && { connection: item.connection }),
      });
      if (item.refused) expect(result).toEqual({ refused: item.refused });
      else expect(result).toEqual(item.expected);
      for (const text of item.forbidden ?? []) expect(JSON.stringify(result)).not.toContain(text);
    });
  }
});

describe("readSourceFile: the contents", () => {
  const text = "table_name,column_name,data_type\n";

  it("reads text given as a string, dropping a byte-order mark", () => {
    const columns = [
      "table_catalog,table_schema,table_name,column_name,ordinal_position,data_type,is_nullable,primary_key_position",
      ",,T,a,1,int,NO,1",
    ].join("\n");
    const result = readSourceFile({ file: "sources/t.columns.csv", contents: `﻿${columns}` });
    expect(result).toMatchObject({ tables: [{ object: "T", columns: [{ name: "a" }] }] });
  });

  it("refuses a columns file that lacks fields, naming those found", () => {
    const result = readSourceFile({ file: "sources/t.columns.csv", contents: text });
    expect(result).toEqual({
      refused: [
        "sources/t.columns.csv has the fields table_name, column_name, data_type; a columns file has exactly: table_catalog, table_schema, table_name, column_name, ordinal_position, data_type, is_nullable, primary_key_position.",
      ],
    });
  });

  it("takes a text sample's table from the import", () => {
    const result = readSourceFile({ file: "x/a.csv", contents: "a,b\n1,x\n", object: "t" });
    expect(result).toMatchObject({ reader: "sample", from: "sample", tables: [{ object: "t" }] });
  });
});
