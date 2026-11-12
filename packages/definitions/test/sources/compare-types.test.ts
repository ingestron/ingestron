// The types of a contract's columns compared with a source metadata table (specification section 12.6).
import { describe, expect, it } from "vitest";
import { compareSourceColumns } from "../../src/index.js";
import type { SourceColumnDoc, SourceTableDoc } from "../../src/documents/index.js";

const loose = { namesOnly: false, caseSensitive: true };

const column = (
  name: string,
  logicalType: string,
  more: Partial<SourceColumnDoc> = {},
): SourceColumnDoc => ({ name, logicalType, required: false, ...more });

const table = (...columns: SourceColumnDoc[]): SourceTableDoc => ({
  object: "ERP.dbo.Orders",
  captured: { at: "2026-11-12T09:30:00Z", from: "catalog", file: "erp.csv" },
  columns,
});

const codes = (found: { code: string }[]) => found.map((item) => item.code);

describe("compareSourceColumns types", () => {
  it("reports a type that fits but differs as SOURCE_TYPE_FITS, compatible", () => {
    const found = compareSourceColumns(
      { columns: [{ name: "total", logicalType: "number" }], primaryKey: [] },
      table(column("total", "integer")),
      loose,
    );
    expect(found).toEqual([
      {
        code: "SOURCE_TYPE_FITS",
        kind: "compatible",
        column: "total",
        before: "number",
        after: "integer",
      },
    ]);
  });

  it("reports a type that does not fit as SOURCE_TYPE_CHANGED, breaking", () => {
    const found = compareSourceColumns(
      { columns: [{ name: "total", logicalType: "integer" }], primaryKey: [] },
      table(column("total", "number")),
      loose,
    );
    expect(found).toEqual([
      {
        code: "SOURCE_TYPE_CHANGED",
        kind: "breaking",
        column: "total",
        before: "integer",
        after: "number",
      },
    ]);
  });

  it("lets integer, number and date fit up the ladder, any scalar fit string, and nothing else", () => {
    const check = (contract: string, source: string) =>
      codes(
        compareSourceColumns(
          { columns: [{ name: "a", logicalType: contract }], primaryKey: [] },
          table(column("a", source)),
          loose,
        ),
      );
    expect(check("number", "integer")).toEqual(["SOURCE_TYPE_FITS"]);
    expect(check("string", "number")).toEqual(["SOURCE_TYPE_FITS"]);
    expect(check("string", "integer")).toEqual(["SOURCE_TYPE_FITS"]);
    expect(check("timestamp", "date")).toEqual(["SOURCE_TYPE_FITS"]);
    expect(check("date", "timestamp")).toEqual(["SOURCE_TYPE_CHANGED"]);
    expect(check("string", "object")).toEqual(["SOURCE_TYPE_CHANGED"]);
    expect(check("object", "string")).toEqual(["SOURCE_TYPE_CHANGED"]);
    expect(check("array", "array")).toEqual([]);
    expect(check("boolean", "integer")).toEqual(["SOURCE_TYPE_CHANGED"]);
  });

  it("does not compare the type of a contract column that gives none", () => {
    expect(
      compareSourceColumns(
        { columns: [{ name: "a" }], primaryKey: [] },
        table(column("a", "integer")),
        loose,
      ),
    ).toEqual([]);
  });

  it("breaks when the source's scale is larger than the contract's, and not the other way", () => {
    const decimal = (precision: number, scale: number) => ({ precision, scale });
    const contract = (options: Record<string, unknown>) => ({
      columns: [{ name: "price", logicalType: "number", logicalTypeOptions: options }],
      primaryKey: [],
    });
    const source = (options: Record<string, unknown>) =>
      table(column("price", "number", { logicalTypeOptions: options }));
    expect(compareSourceColumns(contract(decimal(18, 2)), source(decimal(18, 4)), loose)).toEqual([
      {
        code: "SOURCE_TYPE_CHANGED",
        kind: "breaking",
        column: "price",
        before: "number(18,2)",
        after: "number(18,4)",
      },
    ]);
    expect(
      codes(compareSourceColumns(contract(decimal(18, 4)), source(decimal(16, 2)), loose)),
    ).toEqual(["SOURCE_TYPE_FITS"]);
  });

  it("breaks when the source has more integer digits than the contract", () => {
    const found = compareSourceColumns(
      {
        columns: [
          { name: "a", logicalType: "number", logicalTypeOptions: { precision: 10, scale: 2 } },
        ],
        primaryKey: [],
      },
      table(column("a", "number", { logicalTypeOptions: { precision: 12, scale: 2 } })),
      loose,
    );
    expect(codes(found)).toEqual(["SOURCE_TYPE_CHANGED"]);
  });

  it("counts a missing scale as 0 for a side that gives a precision", () => {
    const contract = (options: Record<string, unknown>) => ({
      columns: [{ name: "a", logicalType: "number", logicalTypeOptions: options }],
      primaryKey: [],
    });
    expect(
      codes(
        compareSourceColumns(
          contract({ precision: 18 }),
          table(column("a", "number", { logicalTypeOptions: { precision: 18, scale: 2 } })),
          loose,
        ),
      ),
    ).toEqual(["SOURCE_TYPE_CHANGED"]);
  });

  it("compares an option only when both sides give it", () => {
    expect(
      compareSourceColumns(
        {
          columns: [{ name: "a", logicalType: "number", logicalTypeOptions: { precision: 5 } }],
          primaryKey: [],
        },
        table(column("a", "number")),
        loose,
      ),
    ).toEqual([]);
    expect(
      compareSourceColumns(
        { columns: [{ name: "a", logicalType: "number" }], primaryKey: [] },
        table(column("a", "number", { logicalTypeOptions: { precision: 5, scale: 9 } })),
        loose,
      ),
    ).toEqual([]);
  });

  it("fits a string of a shorter maxLength, and breaks on a longer one", () => {
    const contract = {
      columns: [{ name: "email", logicalType: "string", logicalTypeOptions: { maxLength: 200 } }],
      primaryKey: [],
    };
    expect(
      compareSourceColumns(
        contract,
        table(column("email", "string", { logicalTypeOptions: { maxLength: 50 } })),
        loose,
      ),
    ).toEqual([
      {
        code: "SOURCE_TYPE_FITS",
        kind: "compatible",
        column: "email",
        before: "string(200)",
        after: "string(50)",
      },
    ]);
    expect(
      codes(
        compareSourceColumns(
          contract,
          table(column("email", "string", { logicalTypeOptions: { maxLength: 300 } })),
          loose,
        ),
      ),
    ).toEqual(["SOURCE_TYPE_CHANGED"]);
  });

  it("keeps a scale that has no precision in the types a message names", () => {
    const found = compareSourceColumns(
      {
        columns: [{ name: "price", logicalType: "number", logicalTypeOptions: { scale: 2 } }],
        primaryKey: [],
      },
      table(column("price", "number", { logicalTypeOptions: { scale: 4 } })),
      loose,
    );
    expect(found).toEqual([
      {
        code: "SOURCE_TYPE_CHANGED",
        kind: "breaking",
        column: "price",
        before: "number(scale 2)",
        after: "number(scale 4)",
      },
    ]);
  });
});
