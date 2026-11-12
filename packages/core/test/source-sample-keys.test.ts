// A JSON sample's keys: the order the file gives them, integer-like keys included, and the rule
// that makes a nested record's keys fields or data (spec/cli/sources.md, section 2.2).
import { describe, expect, it } from "vitest";
import { readSourceFile } from "../src/sources/read-file.js";
import type { SourceRead } from "../src/sources/index.js";

interface Column {
  name: string;
  properties?: Column[];
}

function columnsOf(file: string, contents: string): Column[] {
  const result = readSourceFile({ file, contents, object: "t" }) as SourceRead;
  return result.tables[0]!.columns as Column[];
}

const names = (columns: Column[] | undefined): string[] | undefined => columns?.map((c) => c.name);

describe("a JSON sample keeps the order of its keys", () => {
  const record = '{"b":1,"2024":2,"a":3,"2023":4,"-1":5,"01":6}';

  it("in a list of records, integer-like keys included", () => {
    expect(names(columnsOf("sources/t.json", `[${record}]`))).toStrictEqual([
      "b",
      "2024",
      "a",
      "2023",
      "-1",
      "01",
    ]);
  });

  it("in one record and in lines of records", () => {
    expect(names(columnsOf("sources/t.json", record))).toContain("2024");
    expect(
      names(columnsOf("sources/t.jsonl", `${record}\n${record}\n`))?.slice(0, 4),
    ).toStrictEqual(["b", "2024", "a", "2023"]);
  });

  it("when a key comes twice, at the place it first has", () => {
    expect(names(columnsOf("sources/t.json", '{"a":1,"2":2,"a":3}'))).toStrictEqual(["a", "2"]);
  });

  it("with escapes, a key named __proto__ and every kind of value", () => {
    const text =
      '[{"q\\"\\\\\\u00e9":[1,{"7":null}],"__proto__":true,"8":-1.5e3,"s":"a\\"b","e":{},"l":[]}]';
    expect(names(columnsOf("sources/t.json", text))).toStrictEqual([
      'q"\\é',
      "__proto__",
      "8",
      "s",
      "e",
      "l",
    ]);
  });
});

describe("a nested record's keys are fields only when the records share them", () => {
  const nested = (...keys: string[][]): string =>
    JSON.stringify(
      keys.map((own, id) => ({ id, n: Object.fromEntries(own.map((key) => [key, id])) })),
    );
  const fieldsOf = (text: string): string[] | undefined =>
    names(columnsOf("sources/t.json", text).find((column) => column.name === "n")?.properties);

  it("gives the union of the keys, in the order first found", () => {
    expect(fieldsOf(nested(["b", "a"], ["a", "c", "b"], ["a", "c"]))).toStrictEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("counts an empty record as no record, as null is", () => {
    expect(fieldsOf(nested(["a"], ["a"], []))).toStrictEqual(["a"]);
    expect(fieldsOf(nested([], ["a", "b"], ["a"], ["a", "b"]))).toStrictEqual(["a", "b"]);
    expect(fieldsOf('[{"n":{"a":1}},{"n":{"a":2}},{"n":null}]')).toStrictEqual(["a"]);
  });

  it("reads one record's keys as fields only in a sample of one record", () => {
    const withOthers = (...others: string[]): string =>
      `[{"n":{"ACME":1,"b":2}},${others.map((own) => `{"n":${own}}`).join(",")}]`;
    expect(fieldsOf(withOthers("{}", "{}"))).toBeUndefined();
    expect(fieldsOf(withOthers("null", "null"))).toBeUndefined();
    expect(fieldsOf(withOthers('{"x":1}'))).toBeUndefined();
    expect(fieldsOf('[{"n":{"a":1,"b":2}}]')).toStrictEqual(["a", "b"]);
    expect(fieldsOf('[{"n":{"a":1}},{"n":{"a":2}},{"n":{}}]')).toStrictEqual(["a"]);
    const nested = columnsOf("sources/t.json", '{"x":{"y":{"a":1}},"z":[{"a":1,"b":2}]}');
    expect(nested[0]!.properties?.[0]?.properties?.map((c) => c.name)).toStrictEqual(["a"]);
  });

  it("reads one record's keys in a one-record sample only when no list on the way has two elements", () => {
    const itemsOf = (text: string): Column | undefined =>
      (columnsOf("sources/t.json", text)[0] as Column & { items?: Column }).items;
    const mOf = (text: string): Column | undefined =>
      itemsOf(text)?.properties?.find((column) => column.name === "m");
    expect(mOf('[{"n":[{"m":{"ACME":1}},{"m":{}}]}]')).not.toHaveProperty("properties");
    expect(itemsOf('[{"n":[{"ACME":1},{}]}]')).not.toHaveProperty("properties");
    expect(itemsOf('[{"n":[{"ACME":1},null]}]')).not.toHaveProperty("properties");
    expect(names(itemsOf('[{"n":[{"ACME":1}]}]')?.properties)).toStrictEqual(["ACME"]);
    expect(names(mOf('[{"n":[{"m":{"a":1}},{"m":{"a":2}}]}]')?.properties)).toStrictEqual(["a"]);
    expect(mOf('[{"n":[{"m":{"a":1}},{"m":{"b":2}}]}]')).not.toHaveProperty("properties");
    expect(names(mOf('[{"n":[{"m":{"ACME":1}}]}]')?.properties)).toStrictEqual(["ACME"]);
  });

  it("gives no fields, and no empty list of them, when no record has a key", () => {
    const column = (text: string): Column | undefined =>
      columnsOf("sources/t.json", text).find((one) => one.name === "n");
    for (const text of ['[{"n":{}}]', '[{"n":{}},{"n":{}}]', '[{"n":{"":1}}]'])
      expect(column(text), text).not.toHaveProperty("properties");
  });

  it("gives a key named like a member of every object its own type, not required", () => {
    const text = '[{"n":{"toString":1,"a":1}},{"n":{"toString":2,"a":2}},{"n":{"a":3}}]';
    const [n] = columnsOf("sources/t.json", text) as (Column & { logicalType: string })[];
    expect(n!.properties).toStrictEqual([
      { name: "toString", logicalType: "integer", required: false },
      { name: "a", logicalType: "integer", required: false },
    ]);
  });

  it("reads a top-level key that some records leave out, whatever its name", () => {
    const text = '[{"constructor":1,"__proto__":"x","valueOf":true},{"b":2}]';
    const columns = columnsOf("sources/t.json", text) as (Column & { logicalType: string })[];
    expect(columns.map((c) => [c.name, c.logicalType])).toStrictEqual([
      ["constructor", "integer"],
      ["__proto__", "string"],
      ["valueOf", "boolean"],
      ["b", "integer"],
    ]);
  });

  it("keeps one record's keys, even when they look like data", () => {
    expect(fieldsOf(nested(["a", "b"]))).toStrictEqual(["a", "b"]);
    expect(fieldsOf(nested(["2026-01-01"]))).toBeUndefined();
  });

  it("reads the keys as fields up to 100 of them, and as data from 101", () => {
    const keys = (count: number): string[] =>
      Array.from({ length: count }, (_, at) => `k${String(at)}`);
    expect(fieldsOf(nested(keys(100), keys(100)))).toHaveLength(100);
    expect(fieldsOf(nested(keys(101), keys(101)))).toBeUndefined();
  });

  it("reads a key that holds a date, a number, a UUID or a character no name holds as data", () => {
    for (const key of ["2026-01-01T10:00", "-12", "1.5", "a/b", "né", "a:b", "x#"])
      expect(fieldsOf(nested([key, "k"], [key, "k"])), key).toBeUndefined();
    for (const key of ["a b", "$id", "a.b", "a-b", "A_1", "2026-1-1", "1e5"])
      expect(fieldsOf(nested([key, "k"], [key, "k"])), key).toStrictEqual([key, "k"]);
  });

  it("reads the records among a list's elements together", () => {
    const text = '[{"n":[{"a":1,"b":2},{"a":3},{"a":4,"b":5}]}]';
    const items = columnsOf("sources/t.json", text)[0] as Column & { items?: Column };
    expect(names(items.items?.properties)).toStrictEqual(["a", "b"]);
  });

  it("never holds a value of a row", () => {
    const rows = [{ n: { a: "ZZ-SECRET-42" } }, { n: { a: "ZZ-SECRET-43", b: "ZZ-SECRET-44" } }];
    const text = JSON.stringify(columnsOf("sources/t.json", JSON.stringify(rows)));
    expect(text).not.toContain("ZZ-SECRET");
  });
});

describe("a JSON sample with integer-like keys nested too deeply for the order to be kept", () => {
  it("is read as the file without them is, in the order JavaScript gives", () => {
    const depth = 20000;
    const text = `[${'{"1":'.repeat(depth)}0${"}".repeat(depth)}]`;
    const columns = columnsOf("sources/t.json", text);
    expect(columns[0]!.name).toBe("1");
  });
});

describe("a CSV sample without a header says how many fields its first line has", () => {
  const refused = (text: string): unknown =>
    readSourceFile({ file: "sources/t.csv", contents: text, object: "t" });

  it("with 1 field, in the singular", () => {
    expect(refused("42\n1\n")).toStrictEqual({
      refused: [
        "sources/t.csv has no header row: the first line has 1 field, which is a number or a date.",
      ],
    });
    expect(refused("\n1\n")).toStrictEqual({
      refused: ["sources/t.csv has no header row: the first line has 1 field, which is empty."],
    });
  });

  it("counts empty fields and names none", () => {
    expect(refused("1,,true,2026-01-01\n")).toStrictEqual({
      refused: [
        "sources/t.csv has no header row: the first line has 4 fields, 3 of them numbers or dates.",
      ],
    });
  });
});
