// Choices a flow can opt out of, settings nothing uses, problems reported once
// at the place that causes them, and methods only runs-on may choose.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { memoryFiles } from "@ingestron/config";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { resolveDefinitions, type PackInfo, type ResolvedModel } from "../src/index.js";

const conformance = join(import.meta.dirname, "../../../spec/definitions/conformance");
const read = (file: string) => parse(readFileSync(join(conformance, file), "utf8"));
const pack = read("pack.yaml") as PackInfo;
const local = read("pack-local.yaml") as PackInfo;
const base = (read("55-no-serve.yaml") as { files: Record<string, string> }).files;

function resolve(changes: Record<string, string>, packs: PackInfo[] = [pack], environment = "dev") {
  return resolveDefinitions(memoryFiles({ ...base, ...changes }), { packs, environment });
}
const flow = (extra: string, tables = "  orders: { object: orders, contract: orders }\n") =>
  `apiVersion: ingestron.io/v1\nkind: Flow\nid: sales\nsource: shop\n${extra}tables:\n${tables}`;
const standard = (extra: string, packs = "[test@1]") =>
  `apiVersion: ingestron.io/v1\nkind: Standard\nid: acme\npacks: ${packs}\n${extra}`;
const codes = (result: ReturnType<typeof resolve>) =>
  result.diagnostics.map(({ code, message }) => ({ code, message }));

describe("serve", () => {
  it("lets a flow opt out of the standard's serve default with none", () => {
    const result = resolve({
      "standard.yaml": standard("serve: { default: publish }\n"),
      "sales.yaml": flow("serve: { uses: none }\n"),
    });
    expect(codes(result)).toEqual([]);
    expect("serve" in (result.model as ResolvedModel).tables[0]!).toBe(false);
  });

  it("warns when a flow sets serve settings and nothing serves the table", () => {
    const result = resolve({ "sales.yaml": flow("serve: { with: { schedule: daily } }\n") });
    expect(codes(result)).toEqual([
      {
        code: "SETTINGS_UNUSED",
        message: "Nothing chooses a serve method, so these settings are not used.",
      },
    ]);
  });

  it("reports serve's hand-over once, at the flow's serve, naming the serve step", () => {
    const tables =
      "  orders: { object: orders, contract: orders }\n  refunds: { object: refunds, contract: orders }\n";
    const result = resolve({ "sales.yaml": flow("serve: { uses: publish-files }\n", tables) });
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      code: "HANDOVER",
      message:
        'The serve step "publish-files" reads where "stream" puts its data, and "stream" does not say.',
      location: { file: "sales.yaml", line: 5 },
    });
  });
});

describe("store", () => {
  it("warns when a flow that ends at the landed files sets store settings", () => {
    const result = resolve({
      "sales.yaml": flow("store: { uses: none, with: { cluster: auto } }\n"),
    });
    expect(codes(result)).toEqual([
      {
        code: "SETTINGS_UNUSED",
        message: "The flow ends at the landed files, so its store settings are not used.",
      },
    ]);
  });

  it("does not add that nothing keeps the files when ingest itself failed", () => {
    const noStore: PackInfo = { ...pack, rules: { ...pack.rules, store: undefined } };
    const result = resolve({ "sales.yaml": flow("ingest: { uses: nothing-by-this-name }\n") }, [
      noStore,
    ]);
    expect(result.diagnostics.map(({ code }) => code)).toEqual(["UNKNOWN_METHOD"]);
    expect(result.diagnostics[0]!.message).toContain("nothing-by-this-name");
  });

  it("checks none against the standard's allowed list after an ingest that writes the table", () => {
    const sqlserver = base["shop.yaml"]!.replace("connector: files", "connector: sqlserver");
    const result = resolve({
      "shop.yaml": sqlserver,
      "standard.yaml": standard("store: { allowed: [stream] }\n"),
      "sales.yaml": flow("store: { uses: none }\n"),
    });
    expect(codes(result)).toEqual([
      { code: "METHOD_NOT_ALLOWED", message: 'The standard does not allow "none" for store.' },
    ]);
  });
});

describe("methods only runs-on chooses", () => {
  it("refuses a landed-files method a flow names outside runs-on", () => {
    const result = resolve(
      {
        "standard.yaml": standard("", "[local@1, test@1]"),
        "sales.yaml": flow("ingest: { uses: local-landed, with: { landing: ./x } }\n"),
      },
      [local, pack],
    );
    expect(codes(result)).toContainEqual({
      code: "RUNS_ON",
      message:
        '"local-landed" reads the files another method lands, so only an environment\'s runs-on chooses it.',
    });
  });

  it("names the method runs-on replaced", () => {
    const project = base["project.yaml"]!.replace(
      "environments: { dev: {}, test: {}, prod: {} }",
      "environments: { dev: {}, local: { runs-on: local } }",
    );
    const result = resolve(
      {
        "project.yaml": project,
        "standard.yaml": standard(
          "store: { default: local-table }\ningest: { settings: { local-landed: { landing: ./x } } }\n",
          "[local@1, test@1]",
        ),
        "sales.yaml": flow("ingest: { uses: copy, with: { landing: /land } }\n"),
      },
      [local, pack],
      "local",
    );
    expect(result.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
    expect((result.model as ResolvedModel).tables[0]!.ingest!.chosenBy).toMatchObject({
      by: "runs-on",
      pack: "local",
      replaced: "copy",
    });
  });
});
