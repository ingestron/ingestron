// The serve action: chosen after a table's last step, and only when something chooses it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { memoryFiles } from "@ingestron/config";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { resolveDefinitions, type PackInfo, type ResolvedModel } from "../src/index.js";

const conformance = join(import.meta.dirname, "../../../spec/definitions/conformance");
const pack = parse(readFileSync(join(conformance, "pack.yaml"), "utf8")) as PackInfo;
const base = (
  parse(readFileSync(join(conformance, "55-no-serve.yaml"), "utf8")) as {
    files: Record<string, string>;
  }
).files;
const withServe = (uses: string) =>
  base["sales.yaml"]!.replace("source: shop\n", `source: shop\nserve: { uses: ${uses} }\n`);

function resolve(flow: string, packs: PackInfo[] = [pack]) {
  return resolveDefinitions(memoryFiles({ ...base, "sales.yaml": flow }), {
    packs,
    environment: "dev",
  });
}
const tableOf = (result: ReturnType<typeof resolve>) => (result.model as ResolvedModel).tables[0]!;

describe("serve", () => {
  it("serves a table when the flow names a serve method", () => {
    const result = resolve(withServe("publish"));
    expect(result.diagnostics).toEqual([]);
    expect(tableOf(result).serve?.method).toBe("publish");
  });

  it("has no serve step when nothing chooses one", () => {
    const result = resolve(base["sales.yaml"]!);
    expect(result.diagnostics).toEqual([]);
    expect("serve" in tableOf(result)).toBe(false);
  });

  it("refuses a serve method that needs an output the last step does not record", () => {
    const result = resolve(withServe("publish-files"));
    expect(result.diagnostics.map(({ code, message }) => ({ code, message }))).toEqual([
      {
        code: "HANDOVER",
        message:
          'The serve step "publish-files" reads where "stream" puts its data, and "stream" does not say.',
      },
    ]);
  });

  it("serves from a step that records its output", () => {
    const recording: PackInfo = {
      ...pack,
      methods: {
        ...pack.methods,
        stream: {
          ...pack.methods.stream!,
          output: () => ({ location: "/x/*.parquet", format: "parquet", loads: "add" }),
        },
      },
    };
    const result = resolve(withServe("publish-files"), [recording]);
    expect(result.diagnostics).toEqual([]);
    expect(tableOf(result).serve?.method).toBe("publish-files");
  });

  it("has no serve step when the flow writes none", () => {
    const result = resolve(withServe("none"));
    expect(result.diagnostics).toEqual([]);
    expect("serve" in tableOf(result)).toBe(false);
  });
});
