// Comparing targets and checking a fold (specification section 2.1): the helpers every
// pack that builds environments together uses, so they fold the same way.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { memoryFiles } from "@ingestron/config";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import {
  checkFold,
  compareTargets,
  resolveDefinitions,
  splitDeployText,
  type Pack,
  type PackInfo,
  type ResolvedModel,
} from "../src/index.js";

const conformance = join(import.meta.dirname, "../../../spec/definitions/conformance");
const read = (file: string) => parse(readFileSync(join(conformance, file), "utf8"));
const test = read("pack.yaml") as PackInfo;
const minimal = (read("01-minimal.yaml") as { files: Record<string, string> }).files;

/** The minimal project with three environments, each reading the shop from its own path. */
function project(paths: Record<string, string>, flow = minimal["sales.yaml"]!) {
  const environments = Object.entries(paths)
    .map(([name, path]) => `  ${name}: { values: { shop: "${path}" } }`)
    .join("\n");
  return {
    ...minimal,
    "project.yaml": `id: retail\nenvironments:\n${environments}\nimports: ["*.yaml"]\n`,
    "shop.yaml": minimal["shop.yaml"]!.replace(
      "{ path: /data/shop }",
      '{ path: "${values.shop}" }',
    ),
    "sales.yaml": flow,
  };
}

function modelsOf(files: Record<string, string>, deployTime = false) {
  const names = Object.keys(
    (parse(files["project.yaml"]!) as { environments: object }).environments,
  );
  return Object.fromEntries(
    names.map((environment) => {
      const result = resolveDefinitions(memoryFiles(files), {
        packs: [test],
        environment,
        deployTime,
      });
      expect(result.diagnostics, environment).toEqual([]);
      return [environment, result.model!];
    }),
  );
}

const paths = { dev: "/data/dev", test: "/data/shared", prod: "/data/shared" };

describe("compareTargets", () => {
  it("finds a value that differs in one target only, by pointer, with each target's value", () => {
    const { structural, differing } = compareTargets(modelsOf(project(paths)));
    expect(structural).toEqual([]);
    expect(differing).toContainEqual({
      pointer: "/tables/0/ingest/connection/settings/path",
      values: { dev: "/data/dev", test: "/data/shared", prod: "/data/shared" },
    });
    expect(differing.map(({ pointer }) => pointer)).not.toContain("/tables/0/ingest/method");
  });

  it("reports a method that differs, where the second target's method was chosen", () => {
    const flow = minimal["sales.yaml"]!.replace(
      "source: shop\n",
      'source: shop\ningest: { uses: "${values.reader}" }\n',
    );
    const files = project({ dev: "/a", prod: "/b" }, flow).valueOf() as Record<string, string>;
    files["project.yaml"] = files["project.yaml"]!.replace(
      'dev: { values: { shop: "/a" } }',
      'dev: { values: { shop: "/a", reader: files } }',
    ).replace(
      'prod: { values: { shop: "/b" } }',
      'prod: { values: { shop: "/b", reader: share } }',
    );
    files["standard.yaml"] =
      `${files["standard.yaml"]}ingest:\n  settings:\n    share: { landing: /l, every: 1h, format: csv }\n`;
    const { structural } = compareTargets(modelsOf(files));
    expect(structural).toEqual([
      {
        code: "ENVIRONMENTS_DIFFER",
        severity: "error",
        message: 'Table "orders" uses "files" for ingest in dev and "share" in prod.',
        file: "sales.yaml",
        line: 5,
      },
    ]);
  });

  it("reports a table that some targets do not build, naming them", () => {
    const models = modelsOf(project(paths));
    const { structural } = compareTargets({ ...models, prod: { ...models.prod!, tables: [] } });
    expect(structural.map(({ message }) => message)).toEqual([
      'Table "orders" is built in dev and test but not in prod.',
    ]);
  });

  it("refuses two deploy-time values at one place, asking for one name", () => {
    const files = project({ dev: "${envvar:DEV_HOST}", prod: "${envvar:PROD_HOST}" });
    const { structural } = compareTargets(modelsOf(files, true));
    expect(structural).toEqual([
      {
        code: "DEPLOY_VALUE",
        severity: "error",
        message: "This value is ${envvar:DEV_HOST} in dev and ${envvar:PROD_HOST} in prod.",
        hint: "Use one variable name and give it a different value in each pipeline stage.",
        file: "project.yaml",
        line: 4,
      },
    ]);
  });
});

describe("splitDeployText", () => {
  it("splits a text into its literal parts and the deploy-time values in it", () => {
    const account = { name: "ACCOUNT", text: "${envvar:ACCOUNT}", uses: [] };
    const path = { name: "PATH", text: "${envvar:PATH}", uses: [] };
    expect(
      splitDeployText("abfss://x@${envvar:ACCOUNT}.dfs/${envvar:PATH}", [path, account]),
    ).toEqual(["abfss://x@", account, ".dfs/", path]);
    expect(splitDeployText("plain", [account])).toEqual(["plain"]);
  });
});

/** A toy pack: one file with the shop's path, folded into a placeholder and a file per target. */
function toyPack(fold: (models: Record<string, ResolvedModel>) => Record<string, string>): Pack {
  return {
    ...test,
    build: (model) => ({ "path.txt": `${pathOf(model)}\n` }),
    buildEnvironments: (models) => ({
      files: fold(models as Record<string, ResolvedModel>),
      deployValues: [],
      problems: [],
    }),
  };
}

const pathOf = (model: ResolvedModel) => String(model.tables[0]?.ingest?.connection.settings.path);
const view = (files: Readonly<Record<string, string>>, target: string) => ({
  "path.txt": files["path.txt"]!.replace("{{path}}", files[`values/${target}.txt`] ?? ""),
});

describe("checkFold", () => {
  it("holds for a fold that sets each target's value, for one, two and three targets", () => {
    const pack = toyPack((models) => ({
      "path.txt": "{{path}}\n",
      ...Object.fromEntries(
        Object.entries(models).map(([name, model]) => [`values/${name}.txt`, pathOf(model)]),
      ),
    }));
    expect(checkFold(pack, modelsOf(project(paths)), { view })).toEqual([]);
  });

  it("names each target whose view is not its render", () => {
    const pack = toyPack((models) => ({ "path.txt": `${pathOf(Object.values(models)[0]!)}\n` }));
    expect(checkFold(pack, modelsOf(project(paths)), { view: (files) => ({ ...files }) })).toEqual([
      "With dev, test, for test: path.txt differs from the render.",
      "With dev, test, prod, for test: path.txt differs from the render.",
      "With dev, test, prod, for prod: path.txt differs from the render.",
    ]);
  });

  it("refuses a deploy-time value's text in the folded files, and one not listed in deployValues", () => {
    const pack = toyPack(() => ({ "path.txt": "${envvar:SHOP}\n" }));
    const models = modelsOf(project({ dev: "${envvar:SHOP}" }), true);
    expect(checkFold(pack, models, { view: (files) => ({ ...files }) })).toEqual([
      "With dev: path.txt holds ${envvar:SHOP}.",
      "With dev: ${envvar:SHOP} is in the render of dev but not in deployValues with a name to supply it under.",
    ]);
  });
});
