// Data products: ODPS documents that publish the tables built from their
// output ports' contracts, and the contract facts their passports show.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { memoryFiles } from "@ingestron/config";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { resolveDefinitions, type PackInfo, type ResolvedModel } from "../src/index.js";

const conformance = join(import.meta.dirname, "../../../spec/definitions/conformance");
const read = (file: string) => parse(readFileSync(join(conformance, file), "utf8"));
const pack = read("pack.yaml") as PackInfo;
const base = (read("55-no-serve.yaml") as { files: Record<string, string> }).files;
const resolve = (changes: Record<string, string>) =>
  resolveDefinitions(memoryFiles({ ...base, ...changes }), { packs: [pack], environment: "dev" });
const product = (apiVersion: string) =>
  `apiVersion: ${apiVersion}\nkind: DataProduct\nid: sales\noutputPorts:\n  - { name: orders, contractId: orders }\n`;

describe("data products", () => {
  it("leaves a project without products exactly as it was", () => {
    const result = resolve({});
    expect(result.diagnostics).toEqual([]);
    expect((result.model as ResolvedModel).products).toEqual([]);
  });

  it("reports the same product id in two files, one v1.0.0 and one v1.1.0", () => {
    const result = resolve({ "a.yaml": product("v1.0.0"), "b.yaml": product("v1.1.0") });
    expect(result.diagnostics.map(({ code, location }) => [code, location?.file])).toEqual([
      ["DUPLICATE_PRODUCT", "b.yaml"],
    ]);
  });

  it("does not call an output unbuilt when its table failed for another reason", () => {
    const flow = base["sales.yaml"]!.replace(
      "source: shop",
      "source: shop\ningest: { uses: nothing }",
    );
    const result = resolve({ "sales.yaml": flow, "p.yaml": product("v1.1.0") });
    expect(result.diagnostics.map(({ code }) => code)).toEqual(["UNKNOWN_METHOD"]);
  });

  it("reads roles and slaProperties from the contract", () => {
    const contract = `${base["orders.odcs.yaml"]}roles:
  - { role: finance-analysts, access: read, description: Monthly revenue reporting, firstLevelApprovers: sales-ops-lead }
slaProperties:
  - { property: freshness, value: 1, unit: d }
`;
    const model = resolve({ "orders.odcs.yaml": contract }).model as ResolvedModel;
    const { roles, sla } = model.tables[0]!.contract;
    expect(roles[0]).toEqual({
      role: "finance-analysts",
      access: "read",
      description: "Monthly revenue reporting",
      firstLevelApprovers: "sales-ops-lead",
    });
    expect(sla[0]).toEqual({ property: "freshness", value: "1", unit: "d" });
  });
});
