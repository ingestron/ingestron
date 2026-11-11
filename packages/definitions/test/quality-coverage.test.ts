// What a warning is about (its subject), what a layer's duties do to a pack's `onlyWhere`
// entry, and how rule values follow the check text (specification sections 1.2, 6, 11.7).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { memoryFiles } from "@ingestron/config";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import {
  resolveDefinitions,
  type IntentUse,
  type PackInfo,
  type ResolvedModel,
  type ResolvedTable,
} from "../src/index.js";
import { optionChecks } from "../src/contracts/type-options.js";
import { whereOutcome } from "../src/resolve/quality-judging.js";

const conformance = join(import.meta.dirname, "../../../spec/definitions/conformance");
const pack = parse(readFileSync(join(conformance, "pack.yaml"), "utf8")) as PackInfo;

const base: Record<string, string> = {
  "project.yaml": 'id: retail\nenvironments: { dev: {} }\nimports: ["*.yaml"]\n',
  "standard.yaml": "apiVersion: ingestron.io/v1\nkind: Standard\nid: acme\npacks: [test@1]\n",
  "shop.yaml":
    "apiVersion: ingestron.io/v1\nkind: Connection\nid: shop\nconnector: files\nconnectivity: public\nsettings: { path: /data/shop }\n",
  "sales.yaml":
    "apiVersion: ingestron.io/v1\nkind: Flow\nid: sales\nsource: shop\ntables:\n  orders: { object: orders, contract: orders }\n",
};

function contract(properties: string): string {
  return `apiVersion: v3.1.0
kind: DataContract
id: orders
version: 1.0.0
status: draft
schema:
  - name: orders
    logicalType: object
    properties:
      - { name: id, logicalType: integer, required: true, primaryKey: true }
${properties}`;
}

function resolve(files: Record<string, string>) {
  return resolveDefinitions(memoryFiles({ ...base, ...files }), {
    packs: [pack],
    environment: "dev",
  });
}

describe("subject", () => {
  it("names the capability on CAPABILITY_OFF, and the table it is about", () => {
    const result = resolve({
      "orders.odcs.yaml": contract("      - { name: email, logicalType: string, tags: [pii] }\n"),
    });
    const off = result.diagnostics.find((item) => item.code === "CAPABILITY_OFF");
    expect(off?.subject).toEqual({ table: "orders", feature: "tags" });
  });

  it("leaves the table out of CAPABILITY_OFF for a contract field that two tables use", () => {
    const flow = base["sales.yaml"]!.concat("  returns: { object: returns, contract: orders }\n");
    const result = resolve({
      "sales.yaml": flow,
      "orders.odcs.yaml": contract("      - { name: email, logicalType: string, tags: [pii] }\n"),
    });
    const off = result.diagnostics.filter((item) => item.code === "CAPABILITY_OFF");
    expect(off.map((item) => item.subject)).toEqual([{ feature: "tags" }]);
  });

  it("names the intent value as coverage keys it on NOT_APPLIED, and the table", () => {
    const flow = base["sales.yaml"]!.replace("tables:", "history: full\ntables:");
    const result = resolve({ "sales.yaml": flow, "orders.odcs.yaml": contract("") });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "NOT_APPLIED",
        subject: { table: "orders", feature: "history=full" },
      }),
    ]);
  });

  it("leaves the table out of one warning found for several tables", () => {
    const flow = base["sales.yaml"]!.replace("tables:", "history: full\ntables:").concat(
      "  returns: { object: returns, contract: orders }\n",
    );
    const two = contract("").replace(
      "schema:\n",
      "schema:\n  - name: returns\n    properties: [{ name: id, logicalType: integer }]\n",
    );
    const result = resolve({ "sales.yaml": flow, "orders.odcs.yaml": two });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "NOT_APPLIED", subject: { feature: "history=full" } }),
    ]);
  });

  it("is never set on an error", () => {
    const flow = base["sales.yaml"]!.replace("source: shop", "source: shop\nlayer: platinum");
    const result = resolve({ "sales.yaml": flow, "orders.odcs.yaml": contract("") });
    const errors = result.diagnostics.filter((item) => item.severity === "error");
    expect(errors.length).toBeGreaterThan(0);
    for (const error of errors) expect(error.subject).toBeUndefined();
  });
});

describe("onlyWhere", () => {
  const used: IntentUse = { use: "used", does: "Checks in a view.", onlyWhere: "check" };

  it("applies the value in a layer whose does lists the duty", () => {
    expect(whereOutcome(used, ["cleanse", "check"])).toBeUndefined();
  });

  it("applies check in a raw layer, whose checks count, and no other duty there", () => {
    expect(whereOutcome(used, "raw")).toBeUndefined();
    const cleanse = { ...used, onlyWhere: "cleanse" as const };
    expect(whereOutcome(cleanse, "raw")).toEqual({
      reason: "it is applied only in a layer whose does lists cleanse.",
      hint: "Add `cleanse` to the layer's `does` to apply it here.",
    });
  });

  it("does not apply it in a layer without the duty, or one with no duties", () => {
    const layers: ResolvedTable["does"][] = [["cleanse"], undefined];
    for (const does of layers) {
      expect(whereOutcome(used, does)).toEqual({
        reason: "it is applied only in a layer whose does lists check.",
        hint: "Add `check` to the layer's `does` to apply it here.",
      });
    }
  });

  it("says nothing of an entry without onlyWhere, or one that is not used", () => {
    expect(whereOutcome({ use: "used", does: "Checks." }, undefined)).toBeUndefined();
    expect(whereOutcome({ use: "not-yet", reason: "Not yet." }, undefined)).toBeUndefined();
  });
});

describe("rule values", () => {
  function rules(properties: string) {
    const result = resolve({ "orders.odcs.yaml": contract(properties) });
    expect(result.diagnostics).toEqual([]);
    return (result.model as ResolvedModel).tables[0]!.expectations.filter(
      (item) => item.from === "contract" && item.name !== "id_not_null",
    );
  }

  it("treat null and booleans as the check text does: as text", () => {
    const [valid, missing] = rules(`      - name: flag
        logicalType: string
        quality:
          - { metric: invalidValues, arguments: { validValues: [true, 1, null, a] }, mustBe: 0 }
          - { metric: missingValues, arguments: { missingValues: [false, null] }, mustBe: 0 }
`);
    expect(valid?.check).toBe("`flag` IS NULL OR `flag` IN ('true', 1, 'null', 'a')");
    expect(valid?.rule).toEqual({
      kind: "in",
      column: "flag",
      values: ["true", 1, "null", "a"],
      allowNull: true,
    });
    expect(missing?.check).toBe("`flag` IS NOT NULL AND `flag` NOT IN ('false')");
    expect(missing?.rule).toEqual({
      kind: "notIn",
      column: "flag",
      values: ["false"],
      allowNull: false,
    });
  });

  it("are left off an option whose value is not of its type, so a pack uses the check text", () => {
    // ODCS refuses such a contract when it loads; the check is still made without a rule.
    const [option] = optionChecks("code", { minLength: "2" });
    expect(option).toEqual({
      option: "minLength",
      name: "code_min_length",
      check: "`code` IS NULL OR length(`code`) >= '2'",
    });
  });
});
