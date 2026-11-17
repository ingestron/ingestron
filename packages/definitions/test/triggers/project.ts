// A project whose flow `shop` writes the ingest part under test, resolved with the data-only
// test packs, for the tests of triggers and parameters.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { memoryFiles } from "@ingestron/config";
import { parse } from "yaml";
import { resolveDefinitions, type PackInfo } from "../../src/index.js";

const conformance = join(import.meta.dirname, "../../../../spec/definitions/conformance");
const pack = (file: string) => parse(readFileSync(join(conformance, file), "utf8")) as PackInfo;
const packs = [pack("pack.yaml"), pack("pack-ops.yaml")];

const keyed = `apiVersion: v3.1.0
kind: DataContract
id: orders
version: 1.0.0
status: draft
schema:
  - name: orders
    logicalType: object
    properties:
      - { name: id, logicalType: integer, required: true, primaryKey: true }
`;

const perFlow = "  schedule: { per: flow }\n";

/**
 * The result of resolving a project whose flow has `ingest` and `tables` tables, whose
 * contract is `contract` (by default one with a primary key). `tableExtra` is added to each
 * table's flow mapping, such as `, ingest: { filter: x }`.
 */
export function resolve(
  ingest: string,
  operations = perFlow,
  tables = 1,
  contract = keyed,
  tableExtra = "",
) {
  const names = ["orders", "customers"].slice(0, tables);
  const flow = [
    "apiVersion: ingestron.io/v1\nkind: Flow\nid: shop\nsource: webshop\ningest:",
    ingest,
    "tables:",
    ...names.map((name) => `  ${name}: { object: ${name}, contract: orders${tableExtra} }`),
  ];
  return resolveDefinitions(
    memoryFiles({
      "project.yaml": 'id: retail\nenvironments: { dev: {} }\nimports: ["*.yaml"]\n',
      "standard.yaml": `apiVersion: ingestron.io/v1\nkind: Standard\nid: acme\npacks: [test@1, ops@1]\noperations:\n${operations}`,
      "webshop.yaml":
        "apiVersion: ingestron.io/v1\nkind: Connection\nid: webshop\nconnector: files\nconnectivity: public\nsettings: { path: /data/shop }\n",
      "shop.yaml": flow.join("\n") + "\n",
      "orders.odcs.yaml": contract,
    }),
    { packs, environment: "dev" },
  );
}

/** The contract `resolve` gives its tables unless told otherwise, without its primary key. */
export const unkeyed = keyed.replace(", primaryKey: true", "");

/** Each problem of a result, as `CODE: message`. */
export function problems(result: ReturnType<typeof resolve>): string[] {
  return result.diagnostics.map(({ code, message }) => `${code}: ${message}`);
}

/**
 * The problems of a flow with `triggers` (a list in flow style) and, when given, these
 * `parameters` (a mapping, indented four spaces), under a standard with a schedule for each flow.
 * `intent` is flow-level intent, each line starting a new line of the flow.
 */
export function problemsOf(triggers: string, parameters = "", tables = 1, intent = ""): string[] {
  const declared = parameters ? `  parameters:\n${parameters}\n` : "";
  return problems(resolve(`${declared}  triggers: [${triggers}]${intent}`, perFlow, tables));
}
