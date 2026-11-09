// Method settings that are other names for intent (specification section 11.4): the
// places and outcomes the conformance cases leave out.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { memoryFiles } from "@ingestron/config";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { resolveDefinitions, type Method, type PackInfo } from "../../src/index.js";

const conformance = join(import.meta.dirname, "../../../../spec/definitions/conformance");
const read = (file: string) => parse(readFileSync(join(conformance, file), "utf8"));
const testPack = read("pack.yaml") as PackInfo;
const base = (read("117-pack-intent-defaults.yaml") as { files: Record<string, string> }).files;

const flow = (lines: string[]) =>
  ["apiVersion: ingestron.io/v1", "kind: Flow", "id: sales", "source: shop", ...lines, ""].join(
    "\n",
  );

function resolve(files: Record<string, string>, pack: PackInfo = testPack) {
  const result = resolveDefinitions(memoryFiles({ ...base, ...files }), {
    packs: [pack],
    environment: "dev",
    envvars: {},
  });
  const summary = result.diagnostics.map(({ code, message, location, fixes }) => ({
    code,
    message,
    file: location?.file,
    line: location?.line,
    fixes: (fixes ?? []).map((fix) => fix.edits),
  }));
  return { model: result.model, diagnostics: summary };
}

describe("setting aliases", () => {
  it("move a flow table's setting to the table's own intent", () => {
    const sales = flow([
      "tables:",
      "  orders: { object: orders, contract: orders, store: { with: { mode: upsert } } }",
    ]);
    const { model, diagnostics } = resolve({ "sales.yaml": sales });
    expect(model?.tables[0]).toMatchObject({
      intent: { history: "latest" },
      intentOrigins: { history: { layer: "table", file: "sales.yaml", line: 6 } },
    });
    expect(diagnostics).toEqual([
      {
        code: "SETTING_MOVED",
        message: '"mode" is now written as intent: history: latest.',
        file: "sales.yaml",
        line: 6,
        fixes: [
          [
            { file: "sales.yaml", pointer: "/tables/orders/history", set: "latest" },
            { file: "sales.yaml", pointer: "/tables/orders/store/with/mode", remove: true },
          ],
        ],
      },
    ]);
  });

  it("read the platform's settings at the standard's place, with no fix", () => {
    const platform = [
      "apiVersion: ingestron.io/v1",
      "kind: Platform",
      "id: lakehouse",
      "settings:",
      "  stream: { mode: upsert }",
      "",
    ].join("\n");
    const { model, diagnostics } = resolve({ "platform.yaml": platform });
    expect(model?.tables[0]?.intentOrigins).toEqual({
      history: { layer: "platform", file: "platform.yaml", line: 5 },
    });
    expect(diagnostics).toMatchObject([
      { code: "SETTING_MOVED", file: "platform.yaml", fixes: [] },
    ]);
  });

  it("say which table disagrees, at the table's setting", () => {
    const sales = flow([
      "tables:",
      "  orders: { object: orders, contract: orders, history: none, store: { with: { mode: upsert } } }",
    ]);
    const { diagnostics } = resolve({ "sales.yaml": sales });
    expect(diagnostics).toMatchObject([
      {
        code: "INTENT_CONFLICT",
        message: '"mode: upsert" means history: latest, but this table also says history: none.',
        line: 6,
      },
    ]);
  });

  it("are FIXED_SETTING at a definition's setting when the standard fixes the intent", () => {
    const standard = base["standard.yaml"] + "fixed: { history: none }\n";
    const sales = flow([
      "store: { with: { mode: upsert } }",
      "tables:",
      "  orders: { object: orders, contract: orders }",
    ]);
    const { diagnostics } = resolve({ "standard.yaml": standard, "sales.yaml": sales });
    expect(diagnostics).toMatchObject([
      { code: "FIXED_SETTING", message: 'The standard fixes "history" to "none".', line: 5 },
    ]);
  });

  it("leave a setting as merged when no value stands for the intent", () => {
    const standard = base["standard.yaml"] + "store: { settings: { stream: { mode: append } } }\n";
    const sales = flow([
      "history: full",
      "tables:",
      "  orders: { object: orders, contract: orders }",
    ]);
    const { model } = resolve({ "standard.yaml": standard, "sales.yaml": sales });
    expect(model?.tables[0]).toMatchObject({
      intent: { history: "full" },
      store: { settings: { mode: "append" }, origins: { mode: { layer: "standard" } } },
    });
  });

  it("are BAD_SETTING where the intent is written when the method refuses the value", () => {
    const stream = testPack.methods["stream"]!;
    const aliases = { mode: { values: { history: { history: "full" as const } } } };
    const pack = {
      ...testPack,
      methods: { ...testPack.methods, stream: { ...stream, aliases } as Method },
    };
    const sales = flow([
      "history: full",
      "tables:",
      "  orders: { object: orders, contract: orders }",
    ]);
    const { diagnostics } = resolve({ "sales.yaml": sales }, pack);
    expect(diagnostics).toMatchObject([
      {
        code: "BAD_SETTING",
        message:
          'Settings for "stream": the intent written here makes "mode" "history", which the method does not accept.',
        file: "sales.yaml",
        line: 5,
      },
    ]);
  });
});
