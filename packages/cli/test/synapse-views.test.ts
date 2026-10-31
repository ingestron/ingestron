// ADF lands the files; Synapse serverless SQL shows them, and a transform, as views.
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { run } from "../src/index.js";

it("generates the ADF copies and the Synapse views of a views-only project", () => {
  const folder = join(import.meta.dirname, "fixtures/synapse-views");
  const out = mkdtempSync(join(tmpdir(), "ingestron-synapse-"));
  let output = "";
  const io = { cwd: folder, write: (text: string) => (output += text) };
  expect(run(["apply", "--no-diff", "--definitions", folder, "--out", out], io), output).toBe(0);
  expect(run(["check", "--definitions", folder, "--out", out], io), output).toBe(0);
  expect(existsSync(join(out, "dev/adf/pipeline/pl_sales_erp.json"))).toBe(true);
  const views = readFileSync(join(out, "dev/synapse/views.sql"), "utf8");
  expect(views).toContain("CREATE OR ALTER VIEW [bronze].[customers] AS");
  expect(views).toContain("  BULK 'erp/erp.dbo.Invoices/erp.dbo.Invoices.parquet',");
  expect(views).toContain("CREATE OR ALTER VIEW [silver].[customer_totals] AS");
  expect(views).toContain("FROM [bronze].[invoices]");
  output = "";
  expect(run(["request", "--env", "dev", "--definitions", folder], io)).toBe(0);
  expect(output).toContain("Create the serverless SQL database `sales_dev`");
});
