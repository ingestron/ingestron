// Shared by the passport tests: the retail starter with two products.
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDefinitions, type ResolvedModel } from "@ingestron/definitions";
import { expect } from "vitest";
import { packs } from "../src/packs.js";

const retail = join(import.meta.dirname, "../project-templates/retail");
export const customers = `apiVersion: v1.1.0
kind: DataProduct
id: customers
name: Customers
status: active
description:
  purpose: Everyone who has bought from the web shop. Updated hourly.
team:
  members:
    - { username: mia@example.com, name: Mia Chen, role: owner }
support:
  - { channel: customer-data, url: "https://example.com/customer-data", tool: teams }
outputPorts:
  - { name: customers, contractId: shop.customers }
`;
export const sales = `apiVersion: v1.1.0
kind: DataProduct
id: sales
name: Daily sales
status: active
description:
  purpose: Order totals per customer and day.
team:
  members:
    - { username: sam@example.com, role: owner }
inputPorts:
  - { name: customers, contractId: shop.customers }
outputPorts:
  - { name: daily_sales, contractId: shop.daily_sales, description: "a | b\\nc" }
`;
export const governance = `governance:
  classification: { sensitive: [confidential] }
`;

/** The retail starter with the two products; `change` edits files after copying. */
export function project(change: (folder: string) => void = () => {}): string {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-passport-"));
  cpSync(retail, folder, { recursive: true });
  writeFileSync(join(folder, "contracts/customers.product.yaml"), customers);
  writeFileSync(join(folder, "contracts/sales.product.yaml"), sales);
  const contract = join(folder, "contracts/customers.yaml");
  const text = readFileSync(contract, "utf8")
    .replace(
      "{ name: email, logicalType: string, required: true }",
      "{ name: email, logicalType: string, required: true, classification: confidential }",
    )
    .concat(
      "roles:\n  - { role: marketing-analysts, access: read, description: Campaign reporting, firstLevelApprovers: mia@example.com }\n",
    );
  writeFileSync(contract, text);
  writeFileSync(
    join(folder, "standard.yaml"),
    readFileSync(join(folder, "standard.yaml"), "utf8") + governance,
  );
  change(folder);
  return folder;
}

export function model(folder: string, environment = "dev"): ResolvedModel {
  const result = loadDefinitions(folder, { packs, environment });
  expect(result.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
  return result.model!;
}
