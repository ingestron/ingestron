// Source readers on hostile or deeply shared input: text that makes a naive scanner slow, and
// chains of types that each use the next twice, whose full expansion would be exponential.
import { describe, expect, it } from "vitest";
import { readSourceFile } from "../src/sources/read-file.js";
import type { SourceRead } from "../src/sources/index.js";

const chain = Array.from({ length: 25 }, (_, at) => at);

/** The number of columns in a list of columns, nested ones included. */
function count(columns: { properties?: unknown[]; items?: unknown }[]): number {
  return columns.reduce(
    (total, column) =>
      total +
      1 +
      count((column.properties ?? []) as never[]) +
      (column.items === undefined ? 0 : count([column.items as never])),
    0,
  );
}

/** Reads the text, which must be read whole in well under a second, and gives every table's size. */
function sizes(file: string, contents: string, extra: { object?: string } = {}): number[] {
  const started = performance.now();
  const result = readSourceFile({ file, contents, ...extra }) as SourceRead;
  expect(performance.now() - started).toBeLessThan(1000);
  expect(result).toHaveProperty("tables");
  return result.tables.map((table) => count(table.columns));
}

describe("readSourceFile: XML that could make a scanner slow", () => {
  const cases: [string, string][] = [
    ["an open tag, then many <", `<x>${"<".repeat(20000)}`],
    ["an open tag, then many unfinished comments", `<x>${"<!--".repeat(5000)}`],
    ["many unfinished tags", "<a ".repeat(100000)],
  ];
  for (const [name, text] of cases)
    it(`refuses ${name} at once`, () => {
      const started = performance.now();
      const result = readSourceFile({ file: "sources/x.xml", contents: text });
      expect(performance.now() - started).toBeLessThan(1000);
      expect(result).toStrictEqual({
        refused: [expect.stringMatching(/^sources\/x\.xml is not valid XML/)],
      });
    });
});

describe("readSourceFile: a type that is shared is written once per table", () => {
  it("OData: a chain of complex types that each use the next twice", () => {
    const types = chain.map((at) =>
      at === 24
        ? `<ComplexType Name="T24"><Property Name="a" Type="Edm.String"/></ComplexType>`
        : `<ComplexType Name="T${at}"><Property Name="a" Type="N.T${at + 1}"/><Property Name="b" Type="N.T${at + 1}"/></ComplexType>`,
    );
    const csdl = `<edmx:Edmx xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices><Schema Namespace="N">
      <EntityType Name="E"><Key><PropertyRef Name="Id"/></Key><Property Name="Id" Type="Edm.Int32"/><Property Name="t" Type="N.T0"/></EntityType>
      ${types.join("")}
      <EntityContainer Name="C"><EntitySet Name="Es" EntityType="N.E"/></EntityContainer>
      </Schema></edmx:DataServices></edmx:Edmx>`;
    const [size] = sizes("sources/shop.xml", csdl);
    expect(size).toBeLessThan(100);
  });

  const schema = (at: number): object => ({
    type: "object",
    properties:
      at === 24
        ? { a: { type: "string" } }
        : { a: { $ref: `#/$defs/T${at + 1}` }, b: { $ref: `#/$defs/T${at + 1}` } },
  });
  const defs = Object.fromEntries(chain.map((at) => [`T${at}`, schema(at)]));

  it("OpenAPI: a chain of schemas that each use the next twice", () => {
    const document = { openapi: "3.1.0", components: { schemas: defs } };
    const refs = JSON.stringify(document).replaceAll("#/$defs/", "#/components/schemas/");
    for (const size of sizes("sources/api.json", refs)) expect(size).toBeLessThan(100);
  });

  it("JSON Schema: a chain of definitions that each use the next twice", () => {
    const document = { $schema: "x", ...(schema(-1) as object), $defs: defs };
    const text = JSON.stringify({ ...document, properties: { a: { $ref: "#/$defs/T0" } } });
    const [size] = sizes("sources/s.json", text, { object: "s" });
    expect(size).toBeLessThan(100);
  });

  it("Avro: a chain of records that each use the next twice, once inline and once by name", () => {
    const record = (at: number): object => ({
      type: "record",
      name: `T${at}`,
      fields:
        at === 24
          ? [{ name: "a", type: "string" }]
          : [
              { name: "a", type: record(at + 1) },
              { name: "b", type: `T${at + 1}` },
            ],
    });
    const [size] = sizes("sources/shop/t.avsc", JSON.stringify(record(0)), { object: "t" });
    expect(size).toBeLessThan(100);
  });
});
