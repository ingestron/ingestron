// An environment that runs on a pack: what is replaced, left out and refused.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { memoryFiles } from "@ingestron/config";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { resolveDefinitions, type PackInfo, type ResolvedModel } from "../src/index.js";

const conformance = join(import.meta.dirname, "../../../spec/definitions/conformance");
const packs = ["pack.yaml", "pack-local.yaml"].map(
  (file) => parse(readFileSync(join(conformance, file), "utf8")) as PackInfo,
);
const files = (
  parse(readFileSync(join(conformance, "61-runs-on-managed-skipped.yaml"), "utf8")) as {
    files: Record<string, string>;
  }
).files;

describe("runs-on", () => {
  it("leaves out a transform that reads a table left out, with a warning", () => {
    const transform = [
      "apiVersion: ingestron.io/v1",
      "kind: Transform",
      "id: daily",
      "inputs: [orders]",
      'code: "SELECT * FROM {{ tables.orders }}"',
      "contract: orders",
      "",
    ].join("\n");
    const result = resolveDefinitions(memoryFiles({ ...files, "daily.yaml": transform }), {
      packs,
      environment: "local",
    });
    expect(result.diagnostics.map(({ code, message }) => ({ code, message }))).toEqual([
      {
        code: "RUNS_ON_SKIPPED",
        message:
          '"orders" is ingested by "managed", which lands no files, so it is left out of local.',
      },
      {
        code: "RUNS_ON_SKIPPED",
        message: '"daily" reads "orders", which is left out of local, so it is left out too.',
      },
    ]);
    expect((result.model as ResolvedModel).tables).toEqual([]);
  });

  it("changes nothing in an environment that does not run on a pack", () => {
    const result = resolveDefinitions(memoryFiles(files), { packs, environment: "dev" });
    expect(result.diagnostics).toEqual([]);
    expect((result.model as ResolvedModel).tables[0]?.ingest?.method).toBe("managed");
  });
});
