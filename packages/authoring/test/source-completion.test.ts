// Completion from the source metadata: a flow table's object, the column names in its checks and
// in a contract's properties, on the project of source-project.ts.
import { describe, expect, it } from "vitest";
import { at, brief, files, useSourceProject } from "./source-project.js";

useSourceProject();

describe("a flow table's object", () => {
  it("offers each object of the connection's metadata, with its columns and capture date", () => {
    const items = at("flows/erp.yaml", (text) =>
      text.replace("object: ERP.dbo.Customers", "object: |"),
    );
    expect(brief(items)).toEqual([
      ["ERP.dbo.Customers", "2 columns, captured 2026-11-12"],
      ["ERP.dbo.Orders", "3 columns, captured 2026-11-10"],
      ["ERP.dbo.Archive", "1 column, captured 2026-11-01"],
    ]);
  });

  it("brings its space when typed straight after the colon", () => {
    const items = at("flows/erp.yaml", (text) =>
      text.replace("object: ERP.dbo.Customers", "object:|"),
    );
    expect(items[0]).toMatchObject({
      label: "ERP.dbo.Customers",
      insertText: " ERP.dbo.Customers",
    });
  });

  it("replaces the whole value typed so far, dots included", () => {
    const flow = files["flows/erp.yaml"]!;
    const start = flow.indexOf("object: ERP.dbo.Customers") + "object: ".length;
    const items = at("flows/erp.yaml", (text) =>
      text.replace("object: ERP.dbo.Customers", "object: ERP.d|"),
    );
    expect(items.map((item) => item.replaceFrom)).toEqual([start, start, start]);
    const tight = at("flows/erp.yaml", (text) =>
      text.replace("object: ERP.dbo.Customers", "object:|"),
    );
    expect(tight[0]?.replaceFrom).toBe(start - 1);
    const quoted = at("flows/erp.yaml", (text) =>
      text.replace("object: ERP.dbo.Customers", 'object: "ERP.d|'),
    );
    expect(quoted[0]?.replaceFrom).toBe(start + 1);
  });

  it("leaves the usual suggestions when the connection has no metadata document", () => {
    const items = at(
      "flows/erp.yaml",
      (text) => text.replace("object: ERP.dbo.Customers", "object: |"),
      {
        "sources/erp.yaml":
          "apiVersion: ingestron.io/v1\nkind: SourceMetadata\nid: other\nconnection: other\ntables: []\n",
      },
    );
    expect(items.map((item) => item.label)).not.toContain("ERP.dbo.Customers");
  });
});

describe("column names in a flow table's checks", () => {
  it("offers the table's columns with their source types, also inside an expression", () => {
    const items = at("flows/erp.yaml", (text) =>
      text.replace("check: Email IS NOT NULL", "check: Email IS NOT NULL AND |"),
    );
    expect(brief(items)).toEqual([
      ["CustomerID", "int"],
      ["Email", "nvarchar(200)"],
    ]);
  });

  it("offers them at the start of a check, straight after the colon too", () => {
    const start = at("flows/erp.yaml", (text) =>
      text.replace("check: Email IS NOT NULL", "check: |"),
    );
    expect(start.map((item) => item.label)).toEqual(["CustomerID", "Email"]);
    const tight = at("flows/erp.yaml", (text) =>
      text.replace("check: Email IS NOT NULL", "check:|"),
    );
    expect(tight[0]?.insertText).toBe(" CustomerID");
  });

  it("offers none inside a quoted text, or for a table without a metadata entry", () => {
    expect(
      at("flows/erp.yaml", (text) =>
        text.replace("check: Email IS NOT NULL", "check: Email = 'a|"),
      ),
    ).toEqual([]);
    expect(
      at("flows/erp.yaml", (text) => text.replace("check: id > 0", "check: id > 0 AND |")),
    ).toEqual([]);
  });

  it("does not offer columns for the check's name", () => {
    const items = at("flows/erp.yaml", (text) => text.replace("name: has_email", "name: |"));
    expect(items.map((item) => item.label)).not.toContain("Email");
  });
});

describe("column names in a contract's properties", () => {
  it("offers the columns of the entry of the table that uses the contract", () => {
    const items = at("contracts/orders.yaml", (text) =>
      text.replace("- name: OrderID", "- name: |"),
    );
    expect(brief(items)).toEqual([
      ["OrderID", "int"],
      ["PlacedAt", "datetime2"],
      ["Total", "decimal(18,2)"],
    ]);
  });

  it("falls back to the logical type for a column with no source type", () => {
    const items = at(
      "contracts/orders.yaml",
      (text) => text.replace("- name: OrderID", "- name: |"),
      {
        "flows/erp.yaml": files["flows/erp.yaml"]!.replace("ERP.dbo.Orders", "ERP.dbo.Archive"),
      },
    );
    expect(brief(items)).toEqual([["Only", "string"]]);
  });

  it("offers a nested property the columns inside the column its parent names", () => {
    const metadata = files["sources/erp.yaml"]!.replace(
      "      - { name: PlacedAt,",
      [
        "      - name: Address",
        "        logicalType: object",
        "        required: false",
        "        properties:",
        "          - { name: Street, sourceType: varchar(50), logicalType: string, required: false }",
        "          - { name: City, sourceType: varchar(50), logicalType: string, required: false }",
        "      - { name: PlacedAt,",
      ].join("\n"),
    );
    const items = at(
      "contracts/orders.yaml",
      (text) =>
        text.replace(
          "      - name: OrderID\n        logicalType: integer",
          "      - name: Address\n        logicalType: object\n        properties:\n          - name: |",
        ),
      { "sources/erp.yaml": metadata },
    );
    expect(brief(items)).toEqual([
      ["Street", "varchar(50)"],
      ["City", "varchar(50)"],
    ]);
  });

  it("offers none of them for a contract no table uses, nor for the schema's own name", () => {
    expect(
      at("contracts/loose.yaml", (text) => text.replace("- name: x", "- name: |")).map(
        (item) => item.label,
      ),
    ).not.toContain("OrderID");
    expect(
      at("contracts/orders.yaml", (text) => text.replace("- name: orders", "- name: |")).map(
        (item) => item.label,
      ),
    ).not.toContain("OrderID");
  });
});

describe("what completion shows", () => {
  it("holds names, types, counts and dates only, never a value from a row", () => {
    const shown = [
      at("flows/erp.yaml", (text) => text.replace("object: ERP.dbo.Customers", "object: |")),
      at("flows/erp.yaml", (text) => text.replace("check: Email IS NOT NULL", "check: |")),
      at("contracts/orders.yaml", (text) => text.replace("- name: OrderID", "- name: |")),
    ].flat();
    for (const item of shown)
      expect(item.detail).toMatch(
        /^(\d+ columns?, captured \d{4}-\d{2}-\d{2}|[a-z0-9]+(\(\d+(,\d+)?\))?)$/,
      );
  });
});
