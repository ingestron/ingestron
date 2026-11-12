// Matching a flow table's object with the tables of its connection's source metadata
// (specification section 12.3).
import { describe, expect, it } from "vitest";
import { matchObject } from "../../src/sources/index.js";
import { indexTables, onlyReferences, type TableIndex } from "../../src/sources/match.js";
import type { SourceTableDoc } from "../../src/documents/index.js";

const table = (object: string): SourceTableDoc => ({
  object,
  captured: { at: "2026-11-12T09:30:00Z", from: "catalog", file: "erp.csv" },
  columns: [],
});

const erp = [table("ERP.dbo.Customers"), table("ERP.dbo.Orders")];
const both = [table("ERP.dbo.Customers"), table("CRM.dbo.Customers")];
const insensitive = { parts: 3, caseSensitive: false };
const objects = (found: SourceTableDoc[]) => found.map((item) => item.object);

describe("matchObject with names", () => {
  it("matches parts from the right, with case ignored, and a reference part against anything", () => {
    expect(objects(matchObject("dbo.Customers", "dbo.Customers", erp, insensitive))).toEqual([
      "ERP.dbo.Customers",
    ]);
    expect(
      objects(matchObject("ERP.DBO.customers", "ERP.DBO.customers", erp, insensitive)),
    ).toEqual(["ERP.dbo.Customers"]);
    expect(
      objects(matchObject("dev_erp.dbo.Customers", "${values.db}.dbo.Customers", erp, insensitive)),
    ).toEqual(["ERP.dbo.Customers"]);
  });

  it("compares case when caseSensitive is true", () => {
    const names = { parts: 3, caseSensitive: true };
    expect(matchObject("erp.dbo.customers", "erp.dbo.customers", erp, names)).toEqual([]);
    expect(objects(matchObject("ERP.dbo.Customers", "ERP.dbo.Customers", erp, names))).toEqual([
      "ERP.dbo.Customers",
    ]);
  });

  it("returns every match, in the document's order", () => {
    expect(objects(matchObject("Customers", "Customers", both, insensitive))).toEqual([
      "ERP.dbo.Customers",
      "CRM.dbo.Customers",
    ]);
  });

  it("matches a part that is only a reference whatever it is set to, or not set", () => {
    expect(
      objects(matchObject("${UNSET}.dbo.Customers", "${UNSET}.dbo.Customers", erp, insensitive)),
    ).toEqual(["ERP.dbo.Customers"]);
    expect(
      objects(matchObject("OTHER.dbo.Customers", "${values.db}.dbo.Customers", erp, insensitive)),
    ).toEqual(["ERP.dbo.Customers"]);
  });

  it("compares a part that mixes text and a reference after replacement", () => {
    expect(
      matchObject("dev_erp.dbo.Customers", "dev_${values.db}.dbo.Customers", erp, insensitive),
    ).toEqual([]);
    expect(
      objects(
        matchObject("erp.dbo.Customers", "${values.prefix}erp.dbo.Customers", erp, insensitive),
      ),
    ).toEqual(["ERP.dbo.Customers"]);
  });

  it("matches nothing when the object has more parts than names.parts", () => {
    expect(matchObject("x.ERP.dbo.Customers", "x.ERP.dbo.Customers", erp, insensitive)).toEqual([]);
    expect(
      matchObject(
        "${values.a}.ERP.dbo.Customers",
        "${values.a}.ERP.dbo.Customers",
        erp,
        insensitive,
      ),
    ).toEqual([]);
  });

  it("takes the parts from the resolved text when the whole object is one reference", () => {
    expect(objects(matchObject("ERP.dbo.Customers", "${values.table}", both, insensitive))).toEqual(
      ["ERP.dbo.Customers"],
    );
    expect(
      objects(matchObject("ERP.dbo.Customers", "${values.db}.${values.table}", both, insensitive)),
    ).toEqual(["ERP.dbo.Customers"]);
  });

  it("matches nothing when the whole object is one reference that is unset", () => {
    expect(matchObject("${envvar:TABLE}", "${envvar:TABLE}", both, insensitive)).toEqual([]);
  });

  it("does not split inside a reference", () => {
    expect(
      objects(matchObject("dev.dbo.Customers", "${envvar:ERP.DB}.dbo.Customers", erp, insensitive)),
    ).toEqual(["ERP.dbo.Customers"]);
  });

  it("keeps a dotted value inside the leftmost part that is only a reference", () => {
    expect(
      objects(matchObject("a.b.dbo.Customers", "${values.db}.dbo.Customers", erp, insensitive)),
    ).toEqual(["ERP.dbo.Customers"]);
  });
});

describe("matchObject without names", () => {
  const files = [table("exports/orders"), table("exports/customers")];

  it("is text equality, with case", () => {
    expect(objects(matchObject("exports/orders", "exports/orders", files, undefined))).toEqual([
      "exports/orders",
    ]);
    expect(matchObject("Exports/orders", "Exports/orders", files, undefined)).toEqual([]);
  });

  it("does not split on a dot", () => {
    const dotted = [table("exports/orders.csv")];
    expect(matchObject("orders.csv", "orders.csv", dotted, undefined)).toEqual([]);
    expect(
      objects(matchObject("exports/orders.csv", "exports/orders.csv", dotted, undefined)),
    ).toEqual(["exports/orders.csv"]);
  });
});

describe("onlyReferences", () => {
  it("is true for one reference, or references joined by a dot outside them", () => {
    expect(onlyReferences("${envvar:TABLE}")).toBe(true);
    expect(onlyReferences("${values.schema}.${envvar:TABLE}")).toBe(true);
    expect(onlyReferences("${values.a.b}")).toBe(true);
  });

  it("is false for text, alone or beside a reference", () => {
    expect(onlyReferences("dbo.Customers")).toBe(false);
    expect(onlyReferences("dbo.${envvar:TABLE}")).toBe(false);
    expect(onlyReferences("${envvar:A}${envvar:B}")).toBe(false);
    expect(onlyReferences("t_${envvar:TABLE}")).toBe(false);
  });
});

describe("matchObject with an index of the tables", () => {
  const tables = [
    table("ERP.dbo.Customers"),
    table("CRM.dbo.Customers"),
    table("ERP.dbo.Orders"),
    table("Orders"),
    table("ERP.dbo.orders"),
  ];
  const cases: [string, string][] = [
    ["Customers", "Customers"],
    ["dbo.CUSTOMERS", "dbo.CUSTOMERS"],
    ["ERP.dbo.Orders", "ERP.dbo.Orders"],
    ["orders", "orders"],
    ["ERP.dbo.Orders", "${values.db}.dbo.Orders"],
    ["ERP.dbo.Orders", "ERP.dbo.${values.table}"],
    ["ERP.dbo.Orders", "${values.object}"],
    ["dev.dbo.Orders", "${UNSET}.dbo.Orders"],
    ["Missing", "Missing"],
    ["x.ERP.dbo.Orders", "x.ERP.dbo.Orders"],
    ["ERP.dbo.Orders", "ERP.dbo.O${values.rest}"],
  ];

  for (const names of [
    { parts: 3, caseSensitive: false },
    { parts: 3, caseSensitive: true },
    undefined,
  ]) {
    it(`gives the matches it gives without one, in the same order (${JSON.stringify(names)})`, () => {
      const index = indexTables(tables, names);
      for (const [object, written] of cases)
        expect(matchObject(object, written, tables, names, index), written).toEqual(
          matchObject(object, written, tables, names),
        );
    });
  }

  it("compares about one table for each object, not every table", () => {
    const count = 1000;
    let compared = 0;
    /** A table that counts each read of its object, as each comparison reads it once. */
    const counted = (object: string): SourceTableDoc =>
      Object.defineProperty(table(object), "object", {
        get: () => {
          compared += 1;
          return object;
        },
      });
    const many = Array.from({ length: count }, (_, n) => counted(`ERP.dbo.T${n}`));
    const matchAll = (names: typeof insensitive | undefined, index?: TableIndex) => {
      compared = 0;
      for (let n = 0; n < count; n += 1)
        expect(matchObject(`ERP.dbo.T${n}`, `ERP.dbo.T${n}`, many, names, index)).toHaveLength(1);
      return compared;
    };
    for (const names of [insensitive, undefined]) {
      const index = indexTables(many, names);
      // One read of one table for each object: the index lists one candidate, compared once.
      expect(matchAll(names, index)).toBe(count);
      // Without the index every object is compared with every table.
      expect(matchAll(names)).toBe(count * count);
    }
  });

  it("keeps the full scan when the last part is a reference", () => {
    const index = indexTables(tables, insensitive);
    expect(
      objects(matchObject("ERP.dbo.Orders", "ERP.dbo.${values.table}", tables, insensitive, index)),
    ).toEqual(["ERP.dbo.Customers", "ERP.dbo.Orders", "ERP.dbo.orders"]);
  });
});
