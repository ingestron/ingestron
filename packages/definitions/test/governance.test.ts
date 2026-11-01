// Governance rules in the standard (section 8.1): what a data product must
// say, and how the columns it publishes are classified and shared.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { memoryFiles } from "@ingestron/config";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { resolveDefinitions, type PackInfo } from "../src/index.js";

const conformance = join(import.meta.dirname, "../../../spec/definitions/conformance");
const read = (file: string) => parse(readFileSync(join(conformance, file), "utf8"));
const pack = read("pack.yaml") as PackInfo;
const governed = (read("73-governance-unclassified.yaml") as { files: Record<string, string> })
  .files;
const plain = (read("68-product.yaml") as { files: Record<string, string> }).files;
const resolve = (files: Record<string, string>) =>
  resolveDefinitions(memoryFiles(files), { packs: [pack], environment: "dev" });
const codes = (result: ReturnType<typeof resolve>) => result.diagnostics.map(({ code }) => code);
const contract = (total: string) =>
  governed["orders.odcs.yaml"]!.replace(/- \{ name: total, logicalType: number[^}]*\}/, total);

describe("governance", () => {
  it("checks nothing without a governance section", () => {
    const product = plain["sales-product.yaml"]!.replace(/team:\n {2}members:\n.*\n/, "").replace(
      /description:\n {2}purpose: .*\n/,
      "",
    );
    expect(product).not.toMatch(/team|purpose/);
    expect(codes(resolve({ ...plain, "sales-product.yaml": product }))).toEqual([]);
  });

  it("governs only contracts a product publishes", () => {
    const refunds = governed["orders.odcs.yaml"]!.replace("id: orders", "id: refunds");
    const files = {
      ...governed,
      "orders.odcs.yaml": contract(
        "- { name: total, logicalType: number, classification: internal }",
      ),
      "refunds.odcs.yaml": refunds,
      "refunds.yaml": governed["sales.yaml"]!.replace("id: sales", "id: refunds").replace(
        "orders: { object: orders, contract: orders }",
        "refunds: { object: refunds, contract: refunds }",
      ),
    };
    expect(codes(resolve(files))).toEqual([]);
  });

  it("reports every missing classification in one run", () => {
    const both = governed["orders.odcs.yaml"]!.replace(", classification: internal", "");
    expect(codes(resolve({ ...governed, "orders.odcs.yaml": both }))).toEqual([
      "COLUMN_UNCLASSIFIED",
      "COLUMN_UNCLASSIFIED",
    ]);
  });

  it("offers each allowed value for an unknown classification", () => {
    const files = {
      ...governed,
      "orders.odcs.yaml": contract(
        "- { name: total, logicalType: number, classification: secret }",
      ),
    };
    const [problem] = resolve(files).diagnostics;
    expect(problem?.fixes?.map((fix) => fix.title)).toEqual([
      'Change to "public"',
      'Change to "internal"',
      'Change to "confidential"',
      'Change to "restricted"',
    ]);
  });

  it("accepts an owner role in any case", () => {
    const files = {
      ...governed,
      "orders.odcs.yaml": contract(
        "- { name: total, logicalType: number, classification: internal }",
      ),
      "sales-product.yaml": governed["sales-product.yaml"]!.replace("role: owner", "role: Owner"),
    };
    expect(codes(resolve(files))).toEqual([]);
  });
});
