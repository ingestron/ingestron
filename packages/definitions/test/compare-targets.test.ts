// Comparing the targets of a pack that builds environments together (specification
// section 2.1): what differs in more than values, and every value that differs.
import { describe, expect, it } from "vitest";
import { compareTargets } from "../src/index.js";
import { minimal, modelsOf, paths, project } from "./targets.js";

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

describe("compareTargets with deploy-time values in a longer text", () => {
  const names = (dev: string, prod: string) =>
    compareTargets(modelsOf(project({ dev, prod }), true)).structural.map(
      ({ message, file, line }) => ({ message, file, line }),
    );

  it("names the values that differ, not the first of each, at the second one's first use", () => {
    expect(
      names(
        "abfss://landing@${envvar:ACCT}.dfs.core.windows.net/${envvar:DEVC}",
        "abfss://landing@${envvar:ACCT}.dfs.core.windows.net/${envvar:PRODC}",
      ),
    ).toEqual([
      {
        message: "This value is ${envvar:DEVC} in dev and ${envvar:PRODC} in prod.",
        file: "project.yaml",
        line: 4,
      },
    ]);
  });

  it("compares in the order the text holds them, so swapped values differ", () => {
    expect(names("${envvar:A}/${envvar:B}", "${envvar:B}/${envvar:A}")).toEqual([
      {
        message: "This value is ${envvar:A} in dev and ${envvar:B} in prod.",
        file: "project.yaml",
        line: 4,
      },
    ]);
  });

  it("gives a problem once when two tables share the value", () => {
    const flow = minimal["sales.yaml"]!.replace(
      "orders: { object: orders, contract: orders }",
      "orders: { object: orders, contract: orders }\n  returns: { object: returns, contract: orders }",
    );
    const files = project({ dev: "${envvar:DEV_HOST}", prod: "${envvar:PROD_HOST}" }, flow);
    const { structural } = compareTargets(modelsOf(files, true));
    expect(structural.map(({ message }) => message)).toEqual([
      "This value is ${envvar:DEV_HOST} in dev and ${envvar:PROD_HOST} in prod.",
    ]);
  });
});
