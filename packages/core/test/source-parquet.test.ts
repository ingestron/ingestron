// A Parquet DECIMAL field that gives no scale has a scale of 0, and no key holds undefined.
import { describe, expect, it, vi } from "vitest";

vi.mock("hyparquet", () => ({
  parquetMetadata: () => ({}),
  parquetSchema: () => ({
    children: [
      {
        children: [],
        element: {
          name: "amount",
          type: "INT32",
          repetition_type: "OPTIONAL",
          converted_type: "DECIMAL",
          precision: 9,
        },
      },
    ],
  }),
}));

describe("a Parquet DECIMAL without a scale", () => {
  it("has a scale of 0", async () => {
    const { readSourceFile } = await import("../src/sources/read-file.js");
    const result = readSourceFile({
      file: "sources/shop/a.parquet",
      contents: new Uint8Array(),
      object: "a",
    });
    expect(result).toMatchObject({ tables: [{ columns: [{ sourceType: "INT32(DECIMAL)" }] }] });
    const column = "tables" in result ? result.tables[0]?.columns[0] : undefined;
    expect(column?.logicalTypeOptions).toStrictEqual({ precision: 9, scale: 0 });
  });
});
