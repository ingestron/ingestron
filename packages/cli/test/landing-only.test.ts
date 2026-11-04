// A project that ends its flows at the files ADF lands: no store pack at all.
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { run } from "../src/index.js";

it("applies and checks a project that ends at the landed files, writing only ADF's folder", () => {
  const folder = join(import.meta.dirname, "fixtures/landing-only");
  const out = mkdtempSync(join(tmpdir(), "ingestron-landing-"));
  let output = "";
  const io = { cwd: folder, write: (text: string) => (output += text) };
  expect(run(["apply", "--no-diff", "--definitions", folder, "--out", out], io), output).toBe(0);
  expect(run(["check", "--definitions", folder, "--out", out], io), output).toBe(0);
  const pipeline = JSON.parse(
    readFileSync(join(out, "adf/factory/pipeline/pl_sales_erp.json"), "utf8"),
  );
  expect(pipeline.properties.activities[0].outputs[0].parameters.file).toBe(
    "erp.dbo.Customers.parquet",
  );
  // ADF is the only pack with a target, so build/adf is the only output folder.
  expect(readdirSync(out)).toEqual(["adf"]);
  expect(readdirSync(join(out, "adf/parameters"))).toEqual(["dev.json", "prod.json"]);
});
