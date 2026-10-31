// Ending a flow at the files ingest lands: `store: none`.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { memoryFiles } from "@ingestron/config";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { resolveDefinitions, type PackInfo, type ResolvedModel } from "../src/index.js";

const conformance = join(import.meta.dirname, "../../../spec/definitions/conformance");
const pack = parse(readFileSync(join(conformance, "pack.yaml"), "utf8")) as PackInfo;
const base = (
  parse(readFileSync(join(conformance, "48-store-none-flow.yaml"), "utf8")) as {
    files: Record<string, string>;
  }
).files;

function resolve(changes: Record<string, string> = {}) {
  return resolveDefinitions(memoryFiles({ ...base, ...changes }), {
    packs: [pack],
    environment: "dev",
  });
}

const landing: PackInfo = {
  ...pack,
  id: "landing",
  rules: { ingest: { default: "land" } },
  methods: {
    land: {
      action: "ingest",
      description: "Lands files.",
      connectors: ["files"],
      produces: "files",
      settings: { type: "object" },
    },
  },
};

const tableOf = (result: ReturnType<typeof resolve>) => (result.model as ResolvedModel).tables[0]!;
const codes = (result: ReturnType<typeof resolve>) =>
  result.diagnostics.map(({ code, location }) => ({
    code,
    file: location?.file,
    line: location?.line,
  }));

describe("store: none", () => {
  it("ends a flow at the landed files when the flow says store: none", () => {
    const result = resolve();
    expect(result.diagnostics).toEqual([]);
    const table = tableOf(result);
    expect(table.store).toBeUndefined();
    expect(table.endsAtFiles).toMatchObject({ by: "definition", file: "sales.yaml" });
  });

  it("accepts store: none after an ingest that writes the table", () => {
    const result = resolve({ "shop.yaml": base["shop.yaml"]!.replace("files", "sqlserver") });
    expect(result.diagnostics).toEqual([]);
    const table = tableOf(result);
    expect(table.ingest?.method).toBe("managed");
    expect(table.store).toBeUndefined();
    expect(table.endsAtFiles).toBeUndefined();
  });

  it("refuses none when the standard's allowed list leaves it out", () => {
    const standard = `${base["standard.yaml"]}store: { allowed: [stream] }\n`;
    expect(codes(resolve({ "standard.yaml": standard }))).toEqual([
      { code: "METHOD_NOT_ALLOWED", file: "sales.yaml", line: 5 },
    ]);
  });

  it("refuses none for a transform", () => {
    const transform = [
      "apiVersion: ingestron.io/v1",
      "kind: Transform",
      "id: daily",
      "inputs: [orders]",
      'code: "SELECT * FROM {{ tables.orders }}"',
      "contract: orders",
      "store: { uses: none }",
      "",
    ].join("\n");
    expect(codes(resolve({ "daily.yaml": transform }))).toEqual([
      { code: "HANDOVER", file: "daily.yaml", line: 7 },
    ]);
  });

  it("lets a transform keep its store when the standard ends flows at files", () => {
    const standard = `${base["standard.yaml"]}store: { default: none }\n`;
    const flow = base["sales.yaml"]!.replace("store: { uses: none }", "store: { uses: stream }");
    const transform = [
      "apiVersion: ingestron.io/v1",
      "kind: Transform",
      "id: daily",
      "inputs: [orders]",
      'code: "SELECT * FROM {{ tables.orders }}"',
      "contract: orders",
      "",
    ].join("\n");
    const result = resolve({
      "standard.yaml": standard,
      "sales.yaml": flow,
      "daily.yaml": transform,
    });
    expect(result.diagnostics).toEqual([]);
    const tables = (result.model as ResolvedModel).tables;
    expect(tables.find((table) => table.name === "orders")?.store?.method).toBe("stream");
    expect(tables.find((table) => table.name === "daily")?.store?.method).toBe("view");
  });

  it("refuses a transform that reads a table ending at the landed files", () => {
    const transform = [
      "apiVersion: ingestron.io/v1",
      "kind: Transform",
      "id: daily",
      "inputs: [orders]",
      'code: "SELECT * FROM {{ tables.orders }}"',
      "contract: orders",
      "",
    ].join("\n");
    expect(codes(resolve({ "daily.yaml": transform }))).toEqual([
      { code: "HANDOVER", file: "daily.yaml", line: 4 },
    ]);
  });

  it("uses the standard's next matching rule when its none rule does not apply", () => {
    const standard = `${base["standard.yaml"]}store:\n  when:\n    - { layer: bronze, use: none }\n    - { input: query, use: view }\n`;
    const flow = base["sales.yaml"]!.replace("store: { uses: none }", "store: { uses: stream }");
    const transform = [
      "apiVersion: ingestron.io/v1",
      "kind: Transform",
      "id: daily",
      "layer: bronze",
      "inputs: [orders]",
      'code: "SELECT * FROM {{ tables.orders }}"',
      "contract: orders",
      "",
    ].join("\n");
    const result = resolve({
      "standard.yaml": standard,
      "sales.yaml": flow,
      "daily.yaml": transform,
    });
    expect(result.diagnostics).toEqual([]);
    const daily = (result.model as ResolvedModel).tables.find((table) => table.name === "daily");
    expect(daily?.store?.chosenBy).toMatchObject({ by: "standard-rule", when: { input: "query" } });
  });

  it("reports only the ingest problem when ingest fails and the standard ends flows at files", () => {
    const files = {
      ...base,
      "standard.yaml": `${base["standard.yaml"]!.replace("test@1", "landing@1")}store: { default: none }\n`,
      "sales.yaml": base["sales.yaml"]!.replace("store: { uses: none }\n", ""),
      "shop.yaml": base["shop.yaml"]!.replace("connector: files", "connector: sqlserver"),
    };
    const result = resolveDefinitions(memoryFiles(files), { packs: [landing], environment: "dev" });
    expect(result.diagnostics.map(({ code }) => code)).toEqual(["CONNECTOR_NOT_SUPPORTED"]);
  });
});

describe("quality on landed files", () => {
  it("says a flow table's expectations are not checked when it ends at the landed files", () => {
    const flow = base["sales.yaml"]!.replace(
      "orders: { object: orders, contract: orders }",
      "orders:\n    object: orders\n    contract: orders\n    expectations:\n      - { name: positive_total, check: total >= 0 }",
    );
    const result = resolve({ "sales.yaml": flow });
    expect(
      result.diagnostics.map(({ code, severity, message }) => ({ code, severity, message })),
    ).toEqual([
      {
        code: "QUALITY_RULE_NOT_CHECKED",
        severity: "warning",
        message:
          'Expectation "positive_total" is not checked: the table ends at the landed files, and nothing checks them.',
      },
    ]);
  });
});

describe("no store chosen", () => {
  it("offers to end the flow at the landed files, or to add a store pack, when nothing chooses a store", () => {
    const files = {
      ...base,
      "standard.yaml": base["standard.yaml"]!.replace("test@1", "landing@1"),
      "sales.yaml": base["sales.yaml"]!.replace("store: { uses: none }\n", ""),
    };
    const result = resolveDefinitions(memoryFiles(files), {
      packs: [landing, pack],
      environment: "dev",
    });
    expect(result.diagnostics).toHaveLength(1);
    const [problem] = result.diagnostics;
    expect(problem).toMatchObject({
      code: "UNKNOWN_METHOD",
      message: "Nothing chooses a store method, so nothing keeps the files ingest lands.",
      hint: "Add a store pack, or end the flow at the landed files with store: none.",
    });
    expect(problem!.fixes?.map((fix) => [fix.title, fix.edits])).toEqual([
      [
        "End this flow at the landed files",
        [{ file: "sales.yaml", pointer: "/store/uses", set: "none" }],
      ],
      [
        "End every flow at the landed files",
        [{ file: "standard.yaml", pointer: "/store/default", set: "none" }],
      ],
      ['Add the "test" pack', [{ file: "standard.yaml", pointer: "/packs/-", set: "test@1" }]],
    ]);
  });
});
