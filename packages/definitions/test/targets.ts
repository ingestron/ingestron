// Projects and models for the tests of comparing targets and folding (specification
// section 2.1): the minimal project with environments that read the shop from their own paths.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { memoryFiles } from "@ingestron/config";
import { parse } from "yaml";
import { expect } from "vitest";
import { resolveDefinitions, type PackInfo } from "../src/index.js";

const conformance = join(import.meta.dirname, "../../../spec/definitions/conformance");
const read = (file: string) => parse(readFileSync(join(conformance, file), "utf8"));
export const test = read("pack.yaml") as PackInfo;
export const minimal = (read("01-minimal.yaml") as { files: Record<string, string> }).files;

/** The minimal project with three environments, each reading the shop from its own path. */
export function project(paths: Record<string, string>, flow = minimal["sales.yaml"]!) {
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

/** Each environment of the project, resolved, by name. */
export function modelsOf(files: Record<string, string>, deployTime = false) {
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

export const paths = { dev: "/data/dev", test: "/data/shared", prod: "/data/shared" };
