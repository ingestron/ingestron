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

  const landed = (
    parse(readFileSync(join(conformance, "59-runs-on-landed.yaml"), "utf8")) as {
      files: Record<string, string>;
    }
  ).files;
  const local = (changes: Record<string, string>, available = packs) =>
    resolveDefinitions(memoryFiles({ ...landed, ...changes }), {
      packs: available,
      environment: "local",
    });
  const codes = (result: ReturnType<typeof local>) => result.diagnostics.map(({ code }) => code);

  it("puts the landed method's missing settings in the standard, where they apply", () => {
    const standard = landed["standard.yaml"]!.replace(
      "ingest:\n  settings:\n    local-landed: { landing: ./samples }\n",
      "",
    );
    const [problem] = local({ "standard.yaml": standard }).diagnostics;
    expect(problem?.code).toBe("BAD_SETTING");
    expect(problem?.fixes?.[0]?.edits).toEqual([
      { file: "standard.yaml", pointer: "/ingest/settings/local-landed", set: { landing: null } },
    ]);
  });

  it("runs the landed method even when the standard's allowed list leaves it out", () => {
    const standard = landed["standard.yaml"]!.replace("ingest:\n", "ingest:\n  allowed: [files]\n");
    expect(codes(local({ "standard.yaml": standard }))).toEqual([]);
  });

  it("keeps the pack's own ingest that writes a table", () => {
    const flow = landed["sales.yaml"]!.replace(
      "source: shop\n",
      "source: shop\ningest: { uses: local-direct }\n",
    );
    const shop = landed["shop.yaml"]!.replace("connector: files", "connector: sqlserver");
    const direct = packs.map((pack) =>
      pack.id !== "local"
        ? pack
        : {
            ...pack,
            methods: {
              ...pack.methods,
              "local-direct": {
                action: "ingest" as const,
                description: "Reads a database directly into a table.",
                connectors: ["sqlserver"],
                produces: "table" as const,
                settings: { type: "object" },
              },
            },
          },
    );
    const result = local({ "sales.yaml": flow, "shop.yaml": shop }, direct);
    expect(codes(result)).toEqual([]);
    expect((result.model as ResolvedModel).tables[0]?.ingest?.method).toBe("local-direct");
  });

  it("reports a method of the wrong action as it would anywhere", () => {
    const flow = landed["sales.yaml"]!.replace(
      "source: shop\n",
      "source: shop\ningest: { uses: stream }\n",
    );
    expect(codes(local({ "sales.yaml": flow }))).toEqual(["WRONG_ACTION"]);
  });

  it("does not check the connectors of the landed method that replaces an ingest", () => {
    const strict = packs.map((pack) =>
      pack.id !== "local"
        ? pack
        : {
            ...pack,
            methods: {
              ...pack.methods,
              "local-landed": { ...pack.methods["local-landed"]!, connectors: ["parquet"] },
            },
          },
    );
    expect(codes(local({}, strict))).toEqual([]);
  });

  it("reads the landed files under the names the replaced method wrote", () => {
    const renaming = packs.map((pack) =>
      pack.id !== "test"
        ? pack
        : {
            ...pack,
            methods: { ...pack.methods, files: { ...pack.methods.files!, renames: true as const } },
          },
    );
    const result = local({}, renaming);
    expect(codes(result)).toEqual([]);
    expect((result.model as ResolvedModel).tables[0]?.ingest).toMatchObject({
      method: "local-landed",
      renamed: true,
    });
  });

  it("refuses a transform of another pack in an environment that runs on a pack", () => {
    const transform = [
      "apiVersion: ingestron.io/v1",
      "kind: Transform",
      "id: daily",
      "inputs: [orders]",
      "transform: { uses: sql }",
      'code: "SELECT * FROM {{ tables.orders }}"',
      "contract: orders",
      "",
    ].join("\n");
    const shop = files["shop.yaml"]!.replace("connector: sqlserver", "connector: files");
    const result = resolveDefinitions(
      memoryFiles({ ...files, "shop.yaml": shop, "daily.yaml": transform }),
      { packs, environment: "local" },
    );
    expect(result.diagnostics.map(({ code }) => code)).toContain("RUNS_ON");
  });
});
