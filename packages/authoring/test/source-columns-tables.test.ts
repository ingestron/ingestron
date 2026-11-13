// Columns completed in a flow table's sequence, load cursor, deduplicate order and cleanse
// columns: the metadata entry's, then the contract's own, on the project of source-project.ts.
import { describe, expect, it } from "vitest";
import { at, files, named, useSourceProject } from "./source-project.js";

useSourceProject();

const inserted = (item: { label: string; insertText?: string }) => item.insertText ?? item.label;

describe("a column completed in a flow table", () => {
  const withTable = (table: string, others: Record<string, string> = {}) =>
    at(
      "flows/erp.yaml",
      (text) =>
        text.replace(
          "  customers:\n    object: ERP.dbo.Customers\n",
          `  customers:\n    object: ERP.dbo.Customers\n${table}`,
        ),
      others,
    );
  const brief = (items: { label: string; detail?: string }[]) =>
    items.map(({ label, detail }) => [label, detail]);

  it("offers the entry's columns for the table's sequence", () => {
    expect(brief(withTable("    sequence: |\n"))).toEqual([
      ["CustomerID", "int"],
      ["Email", "nvarchar(200)"],
    ]);
  });

  it("offers them for the load cursor", () => {
    const items = withTable("    load:\n      mode: incremental\n      cursor: |\n");
    expect(items.map((item) => item.label)).toEqual(["CustomerID", "Email"]);
  });

  it("offers them for the items of the deduplicate order, after the dash too", () => {
    const table = "    cleanse:\n      deduplicate:\n        order_by:\n          - ";
    const items = withTable(`${table}|\n`);
    expect(items.map((item) => item.label)).toEqual(["CustomerID", "Email"]);
    expect(items[0]?.insertText).toBeUndefined();
    const tight = withTable(`${table.trimEnd()}|\n`);
    expect(tight[0]).toMatchObject({
      label: "CustomerID",
      insertText: " CustomerID",
      afterDash: true,
    });
    const spaced = withTable(`${table}|\n`, named("Order Date", "123"));
    expect(spaced.map(inserted)).toEqual(["Order Date", '"123"']);
    const tightSpaced = withTable(`${table.trimEnd()}|\n`, named("Order Date", "123"));
    expect(tightSpaced.map(inserted)).toEqual([" Order Date", ' "123"']);
    const typed = withTable(`${table}Em|\n`);
    expect(typed.map((item) => item.label)).toEqual(["CustomerID", "Email"]);
    const inline = withTable("    cleanse:\n      deduplicate: { order_by: [|] }\n");
    expect(inline.map((item) => item.label)).toEqual(["CustomerID", "Email"]);
  });

  it("offers them as a new key under cleanse.columns, leaving out the keys already written", () => {
    const table = "    cleanse:\n      columns:\n";
    expect(withTable(`${table}        |\n`).map((item) => item.label)).toEqual([
      "CustomerID",
      "Email",
    ]);
    const written = withTable(`${table}        Email: { case: lower }\n        |\n`);
    expect(written.map((item) => item.label)).toEqual(["CustomerID"]);
    expect(brief(written)).toEqual([["CustomerID", "int"]]);
  });

  it("writes a name that needs it as a YAML scalar", () => {
    const items = withTable("    sequence: |\n", named("Order Date", "123"));
    expect(items.map(inserted)).toEqual(["Order Date", '"123"']);
    const keys = withTable("    cleanse:\n      columns:\n        |\n", named("Order Date", "123"));
    expect(keys.map(inserted)).toEqual(["Order Date", '"123"']);
  });

  it("offers the contract's own property names after the entry's, each once", () => {
    const contract = files["contracts/orders.yaml"]!.replace(
      "        logicalType: integer\n",
      "        logicalType: integer\n      - name: Total\n        logicalType: number\n      - name: Notes\n        logicalType: string\n",
    );
    const items = at(
      "flows/erp.yaml",
      (text) =>
        text.replace("    contract: erp.orders\n", "    contract: erp.orders\n    sequence: |\n"),
      { "contracts/orders.yaml": contract },
    );
    expect(brief(items)).toEqual([
      ["OrderID", "int"],
      ["PlacedAt", "datetime2"],
      ["Total", "decimal(18,2)"],
      ["Notes", "string"],
    ]);
  });

  it("offers a contract's property names for a table with no metadata entry", () => {
    const items = at("flows/erp.yaml", (text) =>
      text
        .replace("object: ERP.dbo.Orders", "object: ERP.dbo.Nowhere")
        .replace("    contract: erp.orders\n", "    contract: erp.orders\n    sequence: |\n"),
    );
    expect(brief(items)).toEqual([["OrderID", "integer"]]);
  });

  it("offers none for a table with neither an entry nor a contract", () => {
    const items = at("flows/erp.yaml", (text) =>
      text.replace(
        "    object: ERP.dbo.Returns\n",
        "    object: ERP.dbo.Returns\n    sequence: |\n",
      ),
    );
    expect(items.map((item) => item.label)).not.toContain("CustomerID");
    expect(items.map((item) => item.label)).not.toContain("OrderID");
  });

  it("offers none at the flow's own level, where several tables share it", () => {
    for (const edit of [
      (text: string) => text.replace("tables:\n", "sequence: |\ntables:\n"),
      (text: string) => text.replace("tables:\n", "load:\n  cursor: |\ntables:\n"),
    ]) {
      const labels = at("flows/erp.yaml", edit).map((item) => item.label);
      for (const name of ["CustomerID", "Email", "OrderID"]) expect(labels).not.toContain(name);
    }
  });
});
