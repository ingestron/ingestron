// A value that a reference puts in a part of a flow's object (specification section 12.3).
import { describe, expect, it } from "vitest";
import { matchObject } from "../../src/sources/index.js";
import type { SourceTableDoc } from "../../src/documents/index.js";

const table = (object: string): SourceTableDoc => ({
  object,
  captured: { at: "2026-11-12T09:30:00Z", from: "catalog", file: "erp.csv" },
  columns: [],
});

const erp = [table("ERP.dbo.Customers"), table("ERP.dbo.Orders")];
const insensitive = { parts: 3, caseSensitive: false };
const objects = (found: SourceTableDoc[]) => found.map((item) => item.object);

describe("matchObject with a value that holds a dot or a $", () => {
  describe("a value that holds a dot, put in a part by a reference", () => {
    const dotted = [table("ERP.dbo.Customers"), table("dbo.Orders_EU.1")];

    it("matches nothing in a part that mixes text and the reference", () => {
      // Split again, `dbo.Orders_EU.1` would be the three parts of the second table.
      expect(matchObject("dbo.Orders_EU.1", "dbo.Orders_${values.r}", dotted, insensitive)).toEqual(
        [],
      );
      // t holds "b.c", so the object is "dbo.b.c_x.Customers". Split again, it would be four
      // parts, and match the table that has them; as it is, "b.c_x" is one part that holds a dot.
      expect(
        matchObject(
          "dbo.b.c_x.Customers",
          "dbo.${values.t}_x.Customers",
          [table("ERP.dbo.b.c_x.Customers")],
          { parts: 4, caseSensitive: false },
        ),
      ).toEqual([]);
    });

    it("still matches anything in a part that is only the reference, wherever it is", () => {
      expect(
        objects(matchObject("dbo.Orders_EU.1", "dbo.${values.t}", dotted, insensitive)),
      ).toEqual(["ERP.dbo.Customers"]);
      expect(
        objects(matchObject("a.b.dbo.Customers", "${values.s}.dbo.Customers", dotted, insensitive)),
      ).toEqual(["ERP.dbo.Customers"]);
    });

    it("is not an extra part: it never makes an object longer than names.parts", () => {
      const names = { parts: 2, caseSensitive: false };
      expect(objects(matchObject("a.b.c.Customers", "${values.s}.Customers", erp, names))).toEqual([
        "ERP.dbo.Customers",
      ]);
    });

    it("is split as the resolved text when the whole object is references", () => {
      expect(objects(matchObject("dbo.Orders_EU.1", "${values.o}", dotted, insensitive))).toEqual([
        "dbo.Orders_EU.1",
      ]);
    });
  });

  it("reads a doubled dollar before a brace as text, so a dot inside it is a dot between parts", () => {
    // `$${a.b}` is the text `${a.b}`, not a reference that holds the dot: its parts are `${a`
    // and `b}`. Read as a reference, the written parts would be two, and the first of them being
    // only a reference, the table `ERP.x.b}` would match the last of the three resolved parts.
    const braced = [table("ERP.x.b}"), table("ERP.${a.b}")];
    expect(objects(matchObject("p.${a.b}", "${values.s}.$${a.b}", braced, insensitive))).toEqual([
      "ERP.${a.b}",
    ]);
  });

  it("compares a reference literally when no written text is known", () => {
    // `written` is the resolved text, as it is when the flow's file cannot give the text: the
    // part that held `${values.db}` is a literal `dev`, not a wildcard.
    expect(matchObject("dev.dbo.Customers", "dev.dbo.Customers", erp, insensitive)).toEqual([]);
    expect(
      objects(matchObject("ERP.dbo.Customers", "ERP.dbo.Customers", erp, insensitive)),
    ).toEqual(["ERP.dbo.Customers"]);
  });
});
