// Building every environment together (specification sections 1, 1.1 and 2.1): the
// version check for packs that do, deploy-time values, and the diagnostics for what a
// pack could not fold.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { memoryFiles } from "@ingestron/config";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import {
  codeHelp,
  environmentsDiagnostics,
  resolveDefinitions,
  type Pack,
  type PackInfo,
} from "../src/index.js";

const conformance = join(import.meta.dirname, "../../../spec/definitions/conformance");
const read = (file: string) => parse(readFileSync(join(conformance, file), "utf8"));
const test = read("pack.yaml") as PackInfo;
const fold = read("pack-fold.yaml") as PackInfo;
const files = (read("01-minimal.yaml") as { files: Record<string, string> }).files;
const together: Pack = {
  ...fold,
  build: () => ({}),
  buildEnvironments: () => ({ files: {}, deployValues: [], problems: [] }),
};
const withStandard = (packs: string) => ({
  ...files,
  "standard.yaml": files["standard.yaml"]!.replace("packs: [test@1]", `packs: ${packs}`),
});

describe("PACK_VERSION", () => {
  it("names the new version and what changes when version 1 of a pack that builds environments together is named", () => {
    const result = resolveDefinitions(memoryFiles(withStandard("[test@1, fold@1]")), {
      packs: [test, together],
      environment: "dev",
    });
    expect(result.diagnostics).toMatchObject([
      {
        code: "PACK_VERSION",
        message:
          'This standard is for "fold@1", but the pack is fold@2, which builds every environment into one output folder.',
        hint: "Change it to fold@2; the upgrade notes say what changes in the generated files.",
        fixes: [{ title: 'Change to "fold@2"' }],
      },
    ]);
  });

  it("stays WRONG_PACK for version 1 of a version 2 pack that builds one environment at a time", () => {
    const result = resolveDefinitions(memoryFiles(withStandard("[test@1, fold@1]")), {
      packs: [test, fold],
      environment: "dev",
    });
    expect(result.diagnostics.map(({ code }) => code)).toEqual(["WRONG_PACK"]);
  });
});

describe("deploy-time values", () => {
  const shop = (path: string) =>
    files["shop.yaml"]!.replace("settings: { path: /data/shop }", `settings: { path: "${path}" }`);

  it("resolves an environment whose variables are set nowhere, without reporting them", () => {
    const result = resolveDefinitions(
      memoryFiles({ ...files, "shop.yaml": shop("${envvar:SHOP_PATH}") }),
      { packs: [test], environment: "dev", deployTime: true },
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.model?.deployValues).toEqual([
      {
        name: "SHOP_PATH",
        text: "${envvar:SHOP_PATH}",
        uses: [{ file: "shop.yaml", pointer: "/settings/path" }],
      },
    ]);
  });

  it("lists no deploy-time values when the variables are read when generating", () => {
    const result = resolveDefinitions(
      memoryFiles({ ...files, "shop.yaml": shop("${envvar:SHOP_PATH}") }),
      { packs: [test], environment: "dev", envvars: { SHOP_PATH: "/data/shop" } },
    );
    expect(result.model?.tables[0]?.ingest?.connection.settings).toEqual({ path: "/data/shop" });
    expect(result.model?.deployValues).toBeUndefined();
  });

  it("refuses a deploy-time value in a name pattern, naming the variable", () => {
    const standard = `${files["standard.yaml"]}naming: { catalog: "\${envvar:CATALOG}" }\n`;
    const result = resolveDefinitions(memoryFiles({ ...files, "standard.yaml": standard }), {
      packs: [test],
      environment: "dev",
      deployTime: true,
    });
    expect(result.diagnostics).toMatchObject([
      {
        code: "DEPLOY_VALUE",
        severity: "error",
        message:
          '"${envvar:CATALOG}" is supplied only when deploying, so it cannot decide what is generated or what it is called.',
        hint: "Write this value in project.yaml, per environment; keep ${envvar:…} for values the deploying pipeline supplies, such as hosts, paths and accounts.",
        location: { file: "standard.yaml", line: 5 },
      },
    ]);
  });
});

describe("a pack's problems", () => {
  it("become errors at the definition, with the hint for their code, at line 1 when no line is known", () => {
    const diagnostics = environmentsDiagnostics([
      { code: "ENVIRONMENTS_DIFFER", message: "Table x differs.", file: "a.yaml" },
      { code: "DEPLOY_VALUE", message: "Name y varies.", file: "b.yaml", line: 7 },
    ]);
    expect(diagnostics).toEqual([
      {
        code: "ENVIRONMENTS_DIFFER",
        severity: "error",
        message: "Table x differs.",
        hint: "Environments may differ only in values, such as names, paths and hosts; make the rest the same in every environment.",
        location: { file: "a.yaml", line: 1, column: 1 },
      },
      {
        code: "DEPLOY_VALUE",
        severity: "error",
        message: "Name y varies.",
        hint: "Write this value in project.yaml, per environment; keep ${envvar:…} for values the deploying pipeline supplies, such as hosts, paths and accounts.",
        location: { file: "b.yaml", line: 7, column: 1 },
      },
    ]);
    expect(codeHelp.ENVIRONMENTS_DIFFER.meaning).toMatch(/^The pack builds every environment/);
  });
});
