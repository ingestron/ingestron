// Comparing a contract's columns with a source metadata table (specification section 12.6).
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

describe("compareSourceColumns columns, nullability and keys", () => {
  it("reports a column only in the metadata as SOURCE_COLUMN_NEW, compatible", () => {
    expect(
      compareSourceColumns(
        { columns: [{ name: "id" }], primaryKey: [] },
        table(column("id", "integer"), column("region", "string")),
        loose,
      ),
    ).toEqual([{ code: "SOURCE_COLUMN_NEW", kind: "compatible", column: "region" }]);
  });

  it("reports a column only in the contract as SOURCE_COLUMN_GONE, breaking", () => {
    expect(
      compareSourceColumns(
        { columns: [{ name: "id" }, { name: "email" }], primaryKey: [] },
        table(column("id", "integer")),
        loose,
      ),
    ).toEqual([{ code: "SOURCE_COLUMN_GONE", kind: "breaking", column: "email" }]);
  });

  it("reports a required column that the metadata says may be null as SOURCE_NULLABLE", () => {
    expect(
      compareSourceColumns(
        { columns: [{ name: "id", required: true }], primaryKey: [] },
        table(column("id", "integer", { required: false })),
        loose,
      ),
    ).toEqual([
      {
        code: "SOURCE_NULLABLE",
        kind: "breaking",
        column: "id",
        before: "required",
        after: "nullable",
      },
    ]);
    expect(
      compareSourceColumns(
        { columns: [{ name: "id", required: false }], primaryKey: [] },
        table(column("id", "integer", { required: true })),
        loose,
      ),
    ).toEqual([]);
  });

  it("reports a different primary key as SOURCE_KEY_CHANGED, with no column", () => {
    const found = compareSourceColumns(
      { columns: [{ name: "id" }, { name: "region" }], primaryKey: ["id"] },
      table(
        column("id", "integer", { primaryKeyPosition: 1 }),
        column("region", "string", { primaryKeyPosition: 2 }),
      ),
      loose,
    );
    expect(found).toEqual([
      { code: "SOURCE_KEY_CHANGED", kind: "breaking", before: "id", after: "id, region" },
    ]);
  });

  it("orders the entry's key by primaryKeyPosition, and leaves a key the entry does not give", () => {
    const columns = [{ name: "id" }, { name: "region" }];
    expect(
      compareSourceColumns(
        { columns, primaryKey: ["id", "region"] },
        table(
          column("region", "string", { primaryKeyPosition: 2 }),
          column("id", "integer", { primaryKeyPosition: 1 }),
        ),
        loose,
      ),
    ).toEqual([]);
    expect(
      compareSourceColumns(
        { columns, primaryKey: ["id"] },
        table(column("id", "integer"), column("region", "string")),
        loose,
      ),
    ).toEqual([]);
  });

  it("leaves a key the contract does not give, so no SOURCE_KEY_CHANGED", () => {
    expect(
      compareSourceColumns(
        { columns: [{ name: "id" }], primaryKey: [] },
        table(column("id", "integer", { primaryKeyPosition: 1 })),
        loose,
      ),
    ).toEqual([]);
  });

  it("matches by physicalName before name, and with case only when asked", () => {
    const before = { columns: [{ name: "email", physicalName: "EMAIL_ADDR" }], primaryKey: [] };
    const after = table(column("email_addr", "string"));
    expect(compareSourceColumns(before, after, { namesOnly: false, caseSensitive: false })).toEqual(
      [],
    );
    expect(
      codes(compareSourceColumns(before, after, { namesOnly: false, caseSensitive: true })),
    ).toEqual(["SOURCE_COLUMN_GONE", "SOURCE_COLUMN_NEW"]);
    expect(
      compareSourceColumns(
        { columns: [{ name: "email", physicalName: "EMAIL_ADDR" }], primaryKey: [] },
        table(column("email", "string")),
        loose,
      ),
    ).toEqual([
      { code: "SOURCE_COLUMN_GONE", kind: "breaking", column: "email" },
      { code: "SOURCE_COLUMN_NEW", kind: "compatible", column: "email" },
    ]);
  });

  it("with namesOnly reports only SOURCE_COLUMN_GONE and SOURCE_COLUMN_NEW", () => {
    const found = compareSourceColumns(
      {
        columns: [
          { name: "id", logicalType: "integer", required: true },
          { name: "email", logicalType: "string" },
          { name: "total", logicalType: "integer" },
        ],
        primaryKey: ["id"],
      },
      table(
        column("id", "string", { required: false, primaryKeyPosition: 1 }),
        column("total", "number"),
        column("region", "string"),
      ),
      { namesOnly: true, caseSensitive: true },
    );
    expect(codes(found)).toEqual(["SOURCE_COLUMN_GONE", "SOURCE_COLUMN_NEW"]);
    expect(found.map((item) => item.column)).toEqual(["email", "region"]);
  });
});
