// Behaviour the language-neutral cases cannot express: pack checks written
// in code, name pattern errors, and loading from disk.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { memoryFiles } from "@ingestron/config";
import { parse } from "yaml";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadDefinitions, resolveDefinitions, type PackInfo } from "../src/index.js";

const spec = join(import.meta.dirname, "../../../spec/definitions/conformance");
const testPack = parse(readFileSync(join(spec, "pack.yaml"), "utf8")) as PackInfo;
const minimal = (
  parse(readFileSync(join(spec, "01-minimal.yaml"), "utf8")) as { files: Record<string, string> }
).files;

function resolve(files: Record<string, string>, pack: PackInfo = testPack) {
  return resolveDefinitions(memoryFiles(files), { packs: [pack], environment: "dev" });
}

describe("pack checks written in code", () => {
  it("reports each message from a method's check at the table", () => {
    const stream = testPack.methods.stream!;
    const pack = {
      ...testPack,
      methods: {
        ...testPack.methods,
        stream: { ...stream, check: () => ["needs a sequence column"] },
      },
    };
    const result = resolve(minimal, pack);
    expect(result.diagnostics).toMatchObject([
      {
        code: "METHOD_CHECK",
        message: '"stream" for table "orders": needs a sequence column.',
        location: { file: "sales.yaml" },
      },
    ]);
  });
});

describe("pack checks on the whole model", () => {
  it("reports each message at the platform document, or the project when there is none", () => {
    const pack = { ...testPack, check: () => ["classic compute is not supported yet"] };
    const files = {
      ...minimal,
      "platform.yaml": "apiVersion: ingestron.io/v1\nkind: Platform\nid: lake\n",
    };
    expect(resolve(files, pack).diagnostics).toMatchObject([
      {
        code: "PACK_CHECK",
        message: "classic compute is not supported yet.",
        location: { file: "platform.yaml" },
      },
    ]);
    expect(resolve(minimal, pack).diagnostics).toMatchObject([{ code: "PACK_CHECK" }]);
    expect(resolve(minimal, pack).ok).toBe(false);
  });
});

describe("name patterns", () => {
  const withTable = (pattern: string) => ({
    ...minimal,
    "standard.yaml": `${minimal["standard.yaml"]}naming:\n  table: "${pattern}"\n`,
  });

  it("refuses a variable that does not exist, so a typo cannot give a valid but wrong name", () => {
    expect(resolve(withTable("{{ tabel }}")).diagnostics).toMatchObject([
      {
        code: "BAD_PATTERN",
        message: expect.stringContaining("unknown variable tabel"),
        location: { file: "standard.yaml", line: 6 },
      },
    ]);
  });

  it("refuses a filter that does not exist", () => {
    expect(resolve(withTable("{{ table | shout }}")).diagnostics).toMatchObject([
      { code: "BAD_PATTERN" },
    ]);
  });

  it("allows conditions on variables that only some tables have", () => {
    const result = resolve(withTable("{% if source %}{{ source }}_{% endif %}{{ table }}"));
    expect(result.model?.tables[0]?.fullName.table).toBe("shop_orders");
  });
});

describe("loadDefinitions", () => {
  it("loads a folder from disk and reads environment variables", () => {
    const folder = mkdtempSync(join(tmpdir(), "definitions-"));
    const files = {
      ...minimal,
      "shop.yaml": minimal["shop.yaml"]!.replace("/data/shop", '"${envvar:SHOP_PATH}"'),
    };
    for (const [path, text] of Object.entries(files)) writeFileSync(join(folder, path), text);
    const result = loadDefinitions(folder, {
      packs: [testPack],
      environment: "dev",
      envvars: { SHOP_PATH: "/mnt/shop" },
    });
    expect(result.model?.tables[0]?.ingest?.connection.settings).toEqual({ path: "/mnt/shop" });
  });

  it("returns loading problems from @ingestron/config unchanged", () => {
    const result = resolve({
      ...minimal,
      "sales.yaml": minimal["sales.yaml"]!.replace("source: shop", "source: nowhere"),
    });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["BROKEN_LINK"]);
  });
});

describe("schema problems for authors", () => {
  it("say what is wrong in words, with the field's meaning and an example", () => {
    const files = { ...minimal, "standard.yaml": `${minimal["standard.yaml"]}store:\n  fixed:\n` };
    expect(
      resolveDefinitions(memoryFiles(files), { packs: [testPack], environment: "dev" }).diagnostics,
    ).toMatchObject([
      {
        code: "SCHEMA",
        message: "store.fixed is empty; it must be a mapping.",
        hint: expect.stringContaining("For example:\n  fixed:\n    streaming-table:"),
      },
    ]);
  });
});

describe("missing settings", () => {
  it("are one problem naming every key, with what each holds", () => {
    const files = (
      parse(readFileSync(join(spec, "34-missing-settings.yaml"), "utf8")) as {
        files: Record<string, string>;
      }
    ).files;
    const [problem] = resolve(files).diagnostics;
    expect(problem?.message).toBe('"share" needs settings: landing, every, format.');
    expect(problem?.hint).toBe("landing: required.\nevery: required.\nformat: required.");
  });
});

describe("warnings", () => {
  it("come back with the model; only errors stop resolving", () => {
    const files = {
      ...minimal,
      "project.yaml": `${minimal["project.yaml"]}`.replace(
        'imports: ["*.yaml"]',
        'imports: ["*.yaml", "missing/*.yaml"]',
      ),
    };
    const result = resolve(files);
    expect(result.ok).toBe(true);
    expect(result.model).toBeDefined();
    expect(result.diagnostics).toMatchObject([{ code: "NO_MATCH", severity: "warning" }]);
  });
});
