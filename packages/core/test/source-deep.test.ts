// Source readers on documents nested deeper than any source's metadata: each is read to a fixed
// depth and no deeper, or refused, and a refusal never quotes the file.
import { describe, expect, it } from "vitest";
import { readSourceFile } from "../src/sources/read-file.js";
import type { SourceRead } from "../src/sources/index.js";

/** How deep the columns go, counting the top level as 1. */
function depthOf(column: { properties?: unknown[]; items?: unknown } | undefined): number {
  if (column === undefined) return 0;
  const nested = [
    ...((column.properties ?? []) as never[]),
    ...(column.items ? [column.items] : []),
  ];
  return 1 + Math.max(0, ...nested.map((child) => depthOf(child as never)));
}

/** JSON records nested `depth` levels below the top, each with one key `a`. */
function nestedRecord(depth: number): string {
  let text = '"ZZ-SECRET-42"';
  for (let level = 0; level < depth; level += 1) text = `{"a":${text}}`;
  return text;
}

/** An Avro record whose one field is an array of arrays, `depth` deep. */
function nestedArrays(depth: number): string {
  let type = '"int"';
  for (let level = 0; level < depth; level += 1) type = `{"type":"array","items":${type}}`;
  return `{"type":"record","name":"Event","fields":[{"name":"a","type":${type}}]}`;
}

describe("readSourceFile: deep nesting", () => {
  it("reads a JSON sample nested 2000 levels to 17 levels, the deepest without nested fields", () => {
    const result = readSourceFile({
      file: "sources/landing/deep.json",
      contents: `[${nestedRecord(2000)}]`,
      object: "deep",
    }) as SourceRead;
    const [column] = result.tables[0]!.columns;
    expect(depthOf(column)).toBe(17);
    expect(JSON.stringify(result)).not.toContain("ZZ-SECRET-42");
  });

  it("reads JSON lines nested 2000 levels the same way", () => {
    const result = readSourceFile({
      file: "sources/landing/deep.jsonl",
      contents: `${nestedRecord(2000)}\n${nestedRecord(2000)}\n`,
      object: "deep",
    }) as SourceRead;
    expect(depthOf(result.tables[0]!.columns[0])).toBe(17);
  });

  it("reads Avro arrays nested 2000 levels to 17 levels", () => {
    const result = readSourceFile({ file: "sources/events.avsc", contents: nestedArrays(2000) });
    expect(result).toHaveProperty("tables");
    expect(depthOf((result as SourceRead).tables[0]!.columns[0])).toBe(17);
  });

  it("refuses Avro nested too deeply to walk, quoting nothing of the file", () => {
    const result = readSourceFile({ file: "sources/events.avsc", contents: nestedArrays(20000) });
    expect(result).toStrictEqual({
      refused: ["sources/events.avsc is nested too deeply to read."],
    });
  });
});

/** An Avro record nested `depth` records deep, each the one field `a` of the one above. */
function nestedRecords(depth: number): string {
  let type = '"int"';
  for (let level = depth; level >= 1; level -= 1)
    type = `{"type":"record","name":"R${String(level)}","fields":[{"name":"a","type":${type}}]}`;
  return type.replace(/^\{"type":"record","name":"R1"/, '{"type":"record","name":"Event"');
}

/** A CSDL document whose type `T<depth>` has a chain of `depth` base types. */
function baseChain(depth: number): string {
  const types = Array.from({ length: depth + 1 }, (_, at) => {
    const base = at === 0 ? "" : ` BaseType="N.T${String(at - 1)}"`;
    return `<EntityType Name="T${String(at)}"${base}><Property Name="p${String(at)}" Type="Edm.Int32"/></EntityType>`;
  }).join("");
  return `<edmx:Edmx xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices><Schema Namespace="N">${types}<EntityContainer Name="C"><EntitySet Name="S" EntityType="N.T${String(depth)}"/></EntityContainer></Schema></edmx:DataServices></edmx:Edmx>`;
}

describe("readSourceFile: nesting a reader walks without a column to show for it", () => {
  const tooDeep = (file: string): { refused: string[] } => ({
    refused: [`${file} is nested too deeply to read.`],
  });

  it("reads Avro records nested 20000 levels to 17 levels", () => {
    const file = "sources/events.avsc";
    const result = readSourceFile({ file, contents: nestedRecords(20000) });
    expect(result).toHaveProperty("tables");
    expect(depthOf((result as SourceRead).tables[0]!.columns[0])).toBe(17);
  });

  it("reads OData types with 16 base types and refuses 17", () => {
    const file = "sources/shop.xml";
    expect(readSourceFile({ file, contents: baseChain(16) })).toHaveProperty("tables");
    expect(readSourceFile({ file, contents: baseChain(17) })).toStrictEqual(tooDeep(file));
  });
});
