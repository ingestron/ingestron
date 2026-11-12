// Source readers: the conformance cases in spec/cli/conformance/sources/readers/cases.json.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { readSourceRecipe, type SourceRead, type SourceRecipe } from "../src/sources/index.js";
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

describe("readSourceFile: OData CSDL text", () => {
  const csdl = [
    "\ufeff<?xml version='1.0'?>",
    '<edmx:Edmx xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx">',
    "<edmx:DataServices>",
    '<edm:Schema Namespace="N" xmlns:edm="http://schemas.microsoft.com/ado/2008/09/edm">',
    '<edm:EntityType Name="A&amp;B"><edm:Key><edm:PropertyRef Name="k"/></edm:Key>',
    '<edm:Property Name="k" Type="Edm.Int32" Nullable="false"/></edm:EntityType>',
    '<edm:EntityContainer Name="C"><edm:EntitySet Name="Sets" EntityType="N.A&amp;B"/></edm:EntityContainer>',
    "</edm:Schema></edmx:DataServices></edmx:Edmx>",
  ].join("\r\n");

  it("reads prefixed elements, entities and a byte-order mark, with CRLF line ends", () => {
    const result = readSourceFile({ file: "sources/x.xml", contents: csdl });
    expect(result).toStrictEqual({
      reader: "odata",
      from: "document",
      notes: [],
      tables: [
        {
          object: "Sets",
          columns: [
            {
              name: "k",
              sourceType: "Edm.Int32",
              logicalType: "integer",
              required: true,
              primaryKeyPosition: 1,
            },
          ],
        },
      ],
    });
  });

  it("names an entity type as the document spells it when the recipe asks for types", () => {
    const recipe = { objects: "types", read: "odata", kind: "document" } as SourceRecipe;
    const result = readSourceFile({ file: "sources/x.catalog.xml", contents: csdl, recipe });
    expect(result).toMatchObject({ tables: [{ object: "A&B" }] });
  });
});

describe("readSourceFile: columnNames", () => {
  const csdl = `<edmx:Edmx xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices>
    <Schema Namespace="N" xmlns="http://docs.oasis-open.org/odata/ns/edm"><EntityType Name="t">
      <Property Name="_a_value" Type="Edm.Guid"/><Property Name="_b_x" Type="Edm.Guid"/>
      <Property Name="c" Type="Edm.Guid"/></EntityType></Schema></edmx:DataServices></edmx:Edmx>`;
  const names = (columnNames: { match: string; to: string }): unknown => {
    const recipe = {
      objects: "types",
      read: "odata",
      kind: "document",
      columnNames,
    } as SourceRecipe;
    const result = readSourceFile({ file: "sources/x.catalog.xml", contents: csdl, recipe });
    return "tables" in result ? result.tables[0]?.columns.map((column) => column.name) : result;
  };

  it("expands a group that matched nothing to nothing, and one past the last to nothing", () => {
    expect(names({ match: "^_(x)?(.*)$", to: "$1-$2-$3." })).toEqual(["-a_value-.", "-b_x-.", "c"]);
  });

  it("keeps a name whose new name would be empty, and a name the rule does not match", () => {
    expect(names({ match: "^_a_value$", to: "" })).toEqual(["_a_value", "_b_x", "c"]);
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

describe("readSourceFile: a column with an empty name", () => {
  it("Salesforce describe: a field with an empty name is not a column", () => {
    const result = readSourceFile({
      file: "sources/crm/Account.json",
      contents: JSON.stringify({
        name: "Account",
        fields: [
          { name: "Id", type: "id", nillable: false },
          { name: "", type: "string", nillable: true },
        ],
      }),
      recipe: recipeOf("salesforce"),
    });
    expect(result).toMatchObject({ tables: [{ object: "Account", columns: [{ name: "Id" }] }] });
    expect((result as SourceRead).tables[0]!.columns).toHaveLength(1);
  });

  it("OpenAPI: a schema whose only property has an empty name is not a table", () => {
    const result = readSourceFile({
      file: "sources/shop.openapi.json",
      contents: JSON.stringify({
        openapi: "3.1.0",
        components: {
          schemas: { Empty: { type: "object", properties: { "": { type: "string" } } } },
        },
      }),
    });
    expect(result).toStrictEqual({
      refused: ["sources/shop.openapi.json describes no object schemas."],
    });
  });
});
