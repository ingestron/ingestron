// Runs the language-neutral cases in spec/definitions/conformance/ with the
// data-only test pack.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { applyEdits, fixEdits, memoryFiles, type AnyDiagnostic } from "@ingestron/config";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { resolveDefinitions, type Pack, type PackInfo, type ResolvedModel } from "../src/index.js";

interface Case {
  description: string;
  environment?: string;
  envvars?: Record<string, string>;
  missingEnvvars?: "error" | "information";
  deployTime?: boolean;
  files: Record<string, string>;
  expect: {
    tables?: Record<string, unknown>[];
    products?: Record<string, unknown>[];
    names?: Record<string, unknown>;
    platform?: Record<string, unknown>;
    deployValues?: Record<string, unknown>[];
    diagnostics?: Record<string, unknown>[];
    fixed?: { diagnostic: number; title: string; files: Record<string, string> }[];
  };
}

const folder = join(import.meta.dirname, "../../../spec/definitions/conformance");
const packs = ["pack.yaml", "pack-bridge.yaml", "pack-local.yaml", "pack-fold.yaml"].map((file) =>
  packOf(
    parse(readFileSync(join(folder, file), "utf8")) as PackInfo & { buildEnvironments?: true },
  ),
);

/** A data-only pack; `buildEnvironments: true` stands for a pack that builds environments together. */
function packOf(data: PackInfo & { buildEnvironments?: true }): PackInfo | Pack {
  if (!data.buildEnvironments) return data;
  const build = () => ({});
  const buildEnvironments = () => ({ files: {}, deployValues: [], problems: [] });
  return { ...data, build, buildEnvironments };
}

/** Tables with full names as text, as the cases write them. */
function comparableTables(model: ResolvedModel) {
  return model.tables.map((table) => ({
    ...table,
    fullName: `${table.fullName.catalog}.${table.fullName.schema}.${table.fullName.table}`,
  }));
}

function checkTables(model: ResolvedModel, expected: Record<string, unknown>[]): void {
  const tables = comparableTables(model);
  expect(tables).toHaveLength(expected.length);
  expected.forEach((wanted, index) => {
    // `null` for a step means the table has no such step.
    const absent = (["ingest", "store", "serve"] as const).filter((step) => wanted[step] === null);
    for (const step of absent)
      expect((tables[index] as Record<string, unknown> | undefined)?.[step]).toBeUndefined();
    const present = Object.fromEntries(
      Object.entries(wanted).filter(([key]) => !(absent as string[]).includes(key)),
    );
    expect(tables[index]).toMatchObject(present);
  });
}

function checkProducts(model: ResolvedModel, expected: Record<string, unknown>[]): void {
  expect(model.products).toHaveLength(expected.length);
  expected.forEach((wanted, index) => expect(model.products[index]).toMatchObject(wanted));
}

/** The parts of the model a case expects. */
function checkModel(model: ResolvedModel, wanted: Case["expect"]): void {
  if (wanted.tables) checkTables(model, wanted.tables);
  if (wanted.products) checkProducts(model, wanted.products);
  if (wanted.names) expect(model.names).toMatchObject(wanted.names);
  if (wanted.platform) expect(model.platform).toMatchObject(wanted.platform);
  if (wanted.deployValues) expect(model.deployValues).toEqual(wanted.deployValues);
}

/** Each named fix, applied to the case's files, gives the files expected. */
function checkFixed(found: AnyDiagnostic[], testCase: Case): void {
  for (const fixed of testCase.expect.fixed ?? []) {
    const fix = found[fixed.diagnostic]?.fixes?.find((item) => item.title === fixed.title);
    expect(fix, fixed.title).toBeDefined();
    const edits = fixEdits(fix!, (file) => testCase.files[file]);
    const files = Object.keys(fixed.files);
    const changed = files.map((file) =>
      applyEdits(
        testCase.files[file] ?? "",
        edits.filter((edit) => edit.file === file),
      ),
    );
    expect(Object.fromEntries(files.map((file, index) => [file, changed[index]]))).toEqual(
      fixed.files,
    );
  }
}

describe("conformance", () => {
  const names = readdirSync(folder)
    .filter((name) => /^\d/.test(name))
    .sort();
  for (const name of names) {
    const testCase = parse(readFileSync(join(folder, name), "utf8")) as Case;
    it(`${name}: ${testCase.description}`, () => {
      const result = resolveDefinitions(memoryFiles(testCase.files), {
        packs,
        environment: testCase.environment,
        envvars: testCase.envvars ?? {},
        ...(testCase.missingEnvvars && { missingEnvvars: testCase.missingEnvvars }),
        ...(testCase.deployTime && { deployTime: true }),
      });
      const { diagnostics } = testCase.expect;
      // A case that expects only information still resolves, so its tables can be checked too.
      if (diagnostics && testCase.expect.tables) {
        expect(result.model, "the project resolves").toBeDefined();
        checkTables(result.model!, testCase.expect.tables);
      }
      if (diagnostics) {
        const actual = result.diagnostics.map(({ code, severity, location, fixes }) => ({
          code,
          severity,
          ...location,
          fixes: fixes?.map((fix) => fix.title),
        }));
        expect(actual).toHaveLength(diagnostics.length);
        diagnostics.forEach((wanted, index) => expect(actual[index]).toMatchObject(wanted));
        checkFixed(result.diagnostics, testCase);
        return;
      }
      expect(result.diagnostics).toEqual([]);
      checkModel(result.model as ResolvedModel, testCase.expect);
    });
  }
});
