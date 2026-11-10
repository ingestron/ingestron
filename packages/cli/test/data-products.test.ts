// The data products example: both environments generate, with only DuckDB's NOT_APPLIED
// warnings, and a passport per product; removing one classification stops generation.
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDefinitions } from "@ingestron/definitions";
import { expect, it } from "vitest";
import { run } from "../src/index.js";
import { packs } from "@ingestron/core";

const example = join(import.meta.dirname, "fixtures/data-products");

it("generates both environments with only DuckDB's NOT_APPLIED warnings, and a passport per product", () => {
  const out = mkdtempSync(join(tmpdir(), "ingestron-products-"));
  let output = "";
  const io = { cwd: example, write: (text: string) => (output += text) };
  expect(run(["apply", "--no-diff", "--definitions", example, "--out", out], io), output).toBe(0);
  // DuckDB checks no contract rules yet: each is NOT_APPLIED, which stops nothing.
  const codes = [...output.matchAll(/ {2}(warning|error) {2}([A-Z_]+)/g)].map(
    ([, severity, code]) => `${severity} ${code}`,
  );
  expect(new Set(codes)).toEqual(new Set(["warning NOT_APPLIED"]));
  expect(output).not.toMatch(/isn't applied on (?!duckdb:)/);
  for (const environment of ["dev", "local"])
    expect(readFileSync(join(out, "products", environment, "customers.md"), "utf8")).toContain(
      "# Customers",
    );
});

it("stops at an unclassified column a product publishes, as the demo shows", () => {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-products-"));
  cpSync(example, folder, { recursive: true });
  const contract = join(folder, "contracts/customers.yaml");
  const text = readFileSync(contract, "utf8");
  writeFileSync(
    contract,
    text.replace("required: true, classification: confidential }", "required: true }"),
  );
  const result = loadDefinitions(folder, { packs, environment: "dev" });
  // DuckDB's NOT_APPLIED warnings for the rules it does not check yet are left aside.
  const problems = result.diagnostics.filter(({ code }) => code !== "NOT_APPLIED");
  expect(problems.map(({ code, location }) => [code, location?.file, location?.line])).toEqual([
    ["COLUMN_UNCLASSIFIED", "contracts/customers.yaml", 13],
  ]);
});
