import { expect, it } from "vitest";
import { loadDefinitions } from "@ingestron/definitions";
import { adf } from "@ingestron/pack-adf";
import { databricks } from "@ingestron/pack-databricks";
import { exampleFolder } from "../lib/examples.js";

it("demonstrates independent table watermarks and matching store ordering in the SQL example", () => {
  const result = loadDefinitions(exampleFolder("private-sql-server"), {
    packs: [databricks, adf],
    environment: "dev",
  });
  expect(result.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
  const customers = result.model?.tables.find((table) => table.name === "customers");
  const invoices = result.model?.tables.find((table) => table.name === "invoices");
  expect(customers?.ingest?.settings.watermark_column).toBe("modified_at");
  expect(invoices?.ingest?.settings.watermark_column).toBe("updated_at");
  expect(invoices?.store?.settings.sequence_by).toBe("updated_at");
  expect(invoices?.contract.columns.map((column) => column.name)).toContain("updated_at");
});
