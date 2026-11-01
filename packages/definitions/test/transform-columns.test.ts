// A transform's query and its contract: columns the query returns that the
// contract does not keep, and contract columns it does not return.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { memoryFiles } from "@ingestron/config";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { resolveDefinitions, type PackInfo } from "../src/index.js";
import { selectedColumns } from "../src/transform-columns.js";

describe("selectedColumns", () => {
  it("reads names, table.column and aliases from the outermost SELECT", () => {
    expect(
      selectedColumns(
        "SELECT a.customer, count(*) AS orders, sum(b.amount) AS total, max(a.order_id) as max_order_id\nFROM {{ tables.orders }} a GROUP BY a.customer",
      ),
    ).toEqual(["customer", "orders", "total", "max_order_id"]);
  });

  it("reads the main SELECT after WITH, and ignores commas in calls and subqueries", () => {
    expect(
      selectedColumns(
        'WITH t AS (SELECT x, y FROM z)\nSELECT coalesce(x, 0) AS x, (SELECT max(y) FROM t) AS top, "Quoted Name" FROM t',
      ),
    ).toEqual(["x", "top", "Quoted Name"]);
  });

  it("gives up on *, unnamed expressions and code that is not SQL", () => {
    expect(selectedColumns("SELECT * FROM t")).toBeUndefined();
    expect(selectedColumns("SELECT a + b FROM t")).toBeUndefined();
    expect(selectedColumns("df = spark.table('x')")).toBeUndefined();
  });

  it("keeps a quoted name with a dot in it whole", () => {
    expect(selectedColumns('SELECT "Order.Id", t."Line.No", amount FROM t')).toEqual([
      "Order.Id",
      "Line.No",
      "amount",
    ]);
  });

  it("ignores comments and text in quotes", () => {
    expect(selectedColumns("-- SELECT nope\nSELECT 'a, b' AS label /* , c */ FROM t")).toEqual([
      "label",
    ]);
  });
});

describe("transform columns", () => {
  const conformance = join(import.meta.dirname, "../../../spec/definitions/conformance");
  const pack = parse(readFileSync(join(conformance, "pack.yaml"), "utf8")) as PackInfo;
  const { files } = parse(readFileSync(join(conformance, "55-no-serve.yaml"), "utf8")) as {
    files: Record<string, string>;
  };
  const transform = (code: string) =>
    `apiVersion: ingestron.io/v1\nkind: Transform\nid: daily\ninputs: [orders]\ncode: "${code}"\ncontract: orders\n`;
  const warnings = (code: string) =>
    resolveDefinitions(memoryFiles({ ...files, "daily.yaml": transform(code) }), {
      packs: [pack],
      environment: "dev",
    }).diagnostics.map(({ code: id, message }) => ({ code: id, message }));

  it("warns of a column the contract does not keep, and one the query does not return", () => {
    expect(warnings("SELECT id, 1 AS extra FROM {{ tables.orders }}")).toEqual([
      {
        code: "TRANSFORM_COLUMNS",
        message: '"extra" is returned, but the contract orders does not name it.',
      },
      {
        code: "TRANSFORM_COLUMNS",
        message: 'The query returns no column "total", which the contract orders names.',
      },
    ]);
  });

  it("says nothing when the query returns the contract's columns", () => {
    expect(
      warnings("SELECT o.id, sum(o.total) AS total FROM {{ tables.orders }} o GROUP BY o.id"),
    ).toEqual([]);
  });
});
