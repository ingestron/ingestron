// Source readers: the conformance cases in spec/cli/conformance/sources/readers/cases.json.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
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
      if (item.refused) expect(result).toStrictEqual({ refused: item.refused });
      else expect(result).toStrictEqual(item.expected);
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

  it("refuses a columns file that lacks fields, naming those missing", () => {
    const result = readSourceFile({ file: "sources/t.columns.csv", contents: text });
    expect(result).toEqual({
      refused: [
        "sources/t.columns.csv lacks the fields table_catalog, table_schema, ordinal_position, is_nullable, primary_key_position; a columns file has exactly: table_catalog, table_schema, table_name, column_name, ordinal_position, data_type, is_nullable, primary_key_position.",
      ],
    });
  });

  it("takes a text sample's table from the import", () => {
    const result = readSourceFile({ file: "x/a.csv", contents: "a,b\n1,x\n", object: "t" });
    expect(result).toMatchObject({ reader: "sample", from: "sample", tables: [{ object: "t" }] });
  });
});

describe("readSourceFile: parsing", () => {
  const orders = readFileSync(join(conformance, "readers/orders.json"));

  it("parses a JSON file once for every reader that looks at it", () => {
    const parse = vi.spyOn(JSON, "parse");
    const result = readSourceFile({
      file: "sources/shop/orders.json",
      contents: new Uint8Array(orders),
      object: "orders",
      connection: "shop",
    });
    expect(result).toMatchObject({ reader: "sample" });
    expect(parse).toHaveBeenCalledTimes(1);
    parse.mockRestore();
  });

  it("reads YAML without writing a warning for a tag it does not know", () => {
    const warn = vi.spyOn(process, "emitWarning");
    const result = readSourceFile({
      file: "sources/x.odcs.yaml",
      contents: "kind: DataContract\nschema: !unknown []\n",
    });
    expect(warn).not.toHaveBeenCalled();
    expect(result).toStrictEqual({
      refused: ["sources/x.odcs.yaml is a data contract with no schema entries."],
    });
    warn.mockRestore();
  });
});
