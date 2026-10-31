// Where each step's data lands, as its method describes it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { memoryFiles } from "@ingestron/config";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { resolveDefinitions, type PackInfo, type ResolvedModel } from "../src/index.js";

const conformance = join(import.meta.dirname, "../../../spec/definitions/conformance");
const pack = parse(readFileSync(join(conformance, "pack.yaml"), "utf8")) as PackInfo;
const files = (
  parse(readFileSync(join(conformance, "48-store-none-flow.yaml"), "utf8")) as {
    files: Record<string, string>;
  }
).files;

function ingestOf(withOutput: PackInfo) {
  const result = resolveDefinitions(memoryFiles(files), {
    packs: [withOutput],
    environment: "dev",
  });
  expect(result.diagnostics).toEqual([]);
  return (result.model as ResolvedModel).tables[0]!.ingest!;
}

describe("step output", () => {
  it("records the output a method describes for its table", () => {
    const withOutput: PackInfo = {
      ...pack,
      methods: {
        ...pack.methods,
        files: {
          ...pack.methods.files!,
          output: (table) => ({
            location: `/land/${table.ingest!.object}.parquet`,
            format: "parquet",
            loads: "replace",
          }),
        },
      },
    };
    expect(ingestOf(withOutput).output).toEqual({
      location: "/land/orders.parquet",
      format: "parquet",
      loads: "replace",
    });
  });

  it("leaves output absent when the method describes none", () => {
    expect("output" in ingestOf(pack)).toBe(false);
  });
});
