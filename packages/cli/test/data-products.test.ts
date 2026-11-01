// The data products example: both environments generate cleanly with a
// passport per product, and removing one classification stops generation.
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDefinitions } from "@ingestron/definitions";
import { expect, it } from "vitest";
import { run } from "../src/index.js";
import { packs } from "../src/packs.js";

const example = join(import.meta.dirname, "fixtures/data-products");

it("generates both environments with no problems, and a passport per product", () => {
  const out = mkdtempSync(join(tmpdir(), "ingestron-products-"));
  let output = "";
  const io = { cwd: example, write: (text: string) => (output += text) };
  expect(run(["apply", "--no-diff", "--definitions", example, "--out", out], io), output).toBe(0);
  expect(output).not.toMatch(/warning|error/);
  for (const environment of ["dev", "local"])
    expect(readFileSync(join(out, environment, "products/customers.md"), "utf8")).toContain(
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
  expect(
    result.diagnostics.map(({ code, location }) => [code, location?.file, location?.line]),
  ).toEqual([["COLUMN_UNCLASSIFIED", "contracts/customers.yaml", 13]]);
});
