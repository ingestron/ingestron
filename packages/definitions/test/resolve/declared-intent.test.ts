// Declared intent per table (specification section 11.2): what the conformance
// cases, which match partly, cannot say: what a table does not have.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { memoryFiles } from "@ingestron/config";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { resolveDefinitions, type PackInfo } from "../../src/index.js";

const conformance = join(import.meta.dirname, "../../../../spec/definitions/conformance");
const read = (file: string) => parse(readFileSync(join(conformance, file), "utf8"));
const testPack = read("pack.yaml") as PackInfo;
const precedence = (read("107-intent-precedence.yaml") as { files: Record<string, string> }).files;

function standard(body: string): string {
  return [
    "apiVersion: ingestron.io/v1",
    "kind: Standard",
    "id: acme",
    "packs: [test@1]",
    body,
    "",
  ].join("\n");
}

function resolve(files: Record<string, string>, options: { missingEnvvars?: "information" } = {}) {
  return resolveDefinitions(memoryFiles(files), {
    packs: [testPack],
    environment: "dev",
    envvars: {},
    ...options,
  });
}

describe("declared intent", () => {
  it("gives a transform's table no load, whatever the standard says", () => {
    const files: Record<string, string> = {
      ...precedence,
      "standard.yaml": standard("load: { default: files }"),
    };
    const table = resolve(files).model?.tables.find((item) => item.name === "daily");
    expect(table?.intent).toEqual({
      audit: [{ value: "loaded_at", as: "_refreshed_at" }],
    });
    expect(Object.keys(table?.intentOrigins ?? {})).toEqual(["audit"]);
  });

  it("is empty for a table that nothing declares", () => {
    const files: Record<string, string> = { ...precedence, "standard.yaml": standard("") };
    const [orders] = resolve(files).model?.tables ?? [];
    expect(orders).toMatchObject({ intent: { history: "latest" } });
    const bare = resolve({
      ...files,
      "sales.yaml": files["sales.yaml"]!.replace("history: latest\n", ""),
    });
    const table = bare.model?.tables.find((item) => item.name === "orders");
    expect(table?.intent).toEqual({});
    expect(table?.intentOrigins).toEqual({});
  });

  it("merges mappings key by key and records each key's own origin", () => {
    const files: Record<string, string> = {
      ...precedence,
      "standard.yaml": standard("load: { default: files, deletes: soft }"),
      "sales.yaml": precedence["sales.yaml"]!.replace(
        "orders: { object: orders, contract: orders }",
        "orders: { object: orders, contract: orders, load: { deletes: { when: \"op = 'D'\" } } }",
      ),
    };
    const orders = resolve(files).model?.tables.find((item) => item.name === "orders");
    expect(orders?.intent.load).toEqual({
      mode: "files",
      deletes: { mode: "soft", when: "op = 'D'" },
    });
    expect(orders?.intentOrigins).toMatchObject({
      "load.mode": { layer: "standard", line: 5 },
      "load.deletes.mode": { layer: "standard", line: 5 },
      "load.deletes.when": { layer: "table", file: "sales.yaml" },
    });
  });

  it("lets fixed intent win over every layer, naming the bare audit value", () => {
    const files: Record<string, string> = {
      ...precedence,
      "standard.yaml": standard(
        [
          "load: { default: files }",
          "layers: [{ name: bronze, history: none }, silver]",
          "fixed: { history: full, audit: [row_hash] }",
        ].join("\n"),
      ),
      "sales.yaml": precedence["sales.yaml"]!.replace("history: latest\n", ""),
      "daily.yaml": precedence["daily.yaml"]!.replace(/audit:.*\n/, ""),
    };
    const result = resolve(files);
    const orders = result.model?.tables.find((item) => item.name === "orders");
    expect(orders?.intent).toMatchObject({
      history: "full",
      audit: [{ value: "row_hash", as: "_row_hash" }],
    });
    expect(orders?.intentOrigins["history"]).toMatchObject({ layer: "fixed", line: 7 });
  });

  it("does not declare a deciding value that holds an unset reference", () => {
    const files: Record<string, string> = {
      ...precedence,
      "standard.yaml": standard("layers: [{ name: bronze, history: none }, silver]"),
      "sales.yaml": precedence["sales.yaml"]!.replace("history: latest", 'history: "${envvar:H}"'),
    };
    const result = resolve(files, { missingEnvvars: "information" });
    const orders = result.model?.tables.find((item) => item.name === "orders");
    expect(orders?.intent).toEqual({ history: "none" });
    expect(orders?.intentOrigins["history"]).toMatchObject({ layer: "layer" });
  });
});
