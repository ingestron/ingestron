// A project that ends its flows at the files ADF lands: no store pack at all.
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { run } from "../src/index.js";

it("plans and applies a project that ends at the landed files", () => {
  const folder = join(import.meta.dirname, "fixtures/landing-only");
  const out = mkdtempSync(join(tmpdir(), "ingestron-landing-"));
  let output = "";
  const io = { cwd: folder, write: (text: string) => (output += text) };
  expect(run(["apply", "--no-diff", "--definitions", folder, "--out", out], io), output).toBe(0);
  expect(run(["check", "--definitions", folder, "--out", out], io), output).toBe(0);
  const pipeline = JSON.parse(readFileSync(join(out, "dev/pipeline/pl_sales_erp.json"), "utf8"));
  expect(pipeline.properties.activities[0].outputs[0].parameters.file).toBe(
    "erp.dbo.Customers.parquet",
  );
  expect(existsSync(join(out, "dev/databricks.yml"))).toBe(false);
});
