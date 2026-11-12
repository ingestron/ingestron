// Runs the language-neutral cases in spec/definitions/conformance/ with the
// data-only test pack.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { applyEdits, fixEdits, memoryFiles, type AnyDiagnostic } from "@ingestron/config";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import {
  environmentsDiagnostics,
  packLoadProblem,
  resolveDefinitions,
  type EnvironmentsBuild,
  type Method,
  type Pack,
  type PackInfo,
  type ResolvedModel,
} from "../src/index.js";
import { checkReference, type ReferenceCase } from "./reference-cases.js";
import { checkAccepted, checkSeverities, flattened } from "./accepted-expectations.js";
import { checkOperations, checkTables } from "./table-expectations.js";

interface Case {
  description: string;
  environment?: string;
  envvars?: Record<string, string>;
  missingEnvvars?: "error" | "information";
  deployTime?: boolean;
  environmentsTogether?: boolean;
  replaceMe?: "warning" | "error";
  /** True to resolve with the option that lists each flow table's source entry. */
  sourceTables?: boolean;
  /** The paths each pack lists as `platformFields` in this case, by pack id. */
  platformFields?: Record<string, string[]>;
  files: Record<string, string>;
  /** In place of `files`: what a pack's `buildEnvironments` returns as its problems. */
  packProblems?: EnvironmentsBuild["problems"];
  /** In place of `files`: a document kind, or a method of a data-only pack, to describe. */
  reference?: ReferenceCase["reference"];
  expect: {
    paths?: string[];
    fields?: ({ path: string } & Record<string, unknown>)[];
    absent?: string[];
    /** The message of the error that refuses the packs. */
    refused?: string;
    tables?: Record<string, unknown>[];
    products?: Record<string, unknown>[];
    names?: Record<string, unknown>;
    platform?: Record<string, unknown>;
    standard?: Record<string, unknown>;
    deployValues?: Record<string, unknown>[];
    previewFeatures?: Record<string, unknown>[];
    operations?: Record<string, unknown>;
    qualityResults?: boolean;
    /** The result's list of source tables, exactly; `null` when the result has none. */
    sourceTables?: Record<string, unknown>[] | null;
    diagnostics?: Record<string, unknown>[];
    /** The accepted warnings, each like a diagnostic with the entry's `reason` and `entry`. */
    accepted?: Record<string, unknown>[];
    fixed?: { diagnostic: number; title: string; files: Record<string, string> }[];
  };
}

const folder = join(import.meta.dirname, "../../../spec/definitions/conformance");
/** A pack file: a pack's information, with stand-ins for what is code. */
type DataPack = PackInfo & { buildEnvironments?: true; checks?: string[] };

const packs = [
  "pack.yaml",
  "pack-bridge.yaml",
  "pack-local.yaml",
  "pack-fold.yaml",
  "pack-checked.yaml",
  "pack-plain.yaml",
  "pack-three.yaml",
  "pack-intent.yaml",
  "pack-ops.yaml",
  "pack-databricks.yaml",
  "pack-rule.yaml",
  "pack-quality.yaml",
  "pack-zones.yaml",
  "pack-dedupe.yaml",
  "pack-views.yaml",
].map((file) =>
  packOf(
    parse(readFileSync(join(folder, file), "utf8")) as PackInfo & { buildEnvironments?: true },
  ),
);

/**
 * A data-only pack. `buildEnvironments: true` stands for a pack that builds environments
 * together; `checks` on the pack or a method, for a `check` that returns those messages.
 */
function packOf(data: DataPack): PackInfo | Pack {
  const methods = Object.fromEntries(
    Object.entries(data.methods).map(([id, method]) => {
      const { checks, ...rest } = method as Method & { checks?: string[] };
      return [id, checks ? { ...rest, check: () => checks } : rest];
    }),
  );
  const { checks, buildEnvironments: together, ...info } = data;
  const pack: PackInfo = { ...info, methods, ...(checks && { check: () => checks }) };
  if (!together) return pack;
  const buildEnvironments = () => ({ files: {}, deployValues: [], problems: [] });
  return { ...pack, build: () => ({}), buildEnvironments };
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
  if (wanted.standard) expect(model.standard).toMatchObject(wanted.standard);
  if (wanted.deployValues) expect(model.deployValues).toEqual(wanted.deployValues);
  if (wanted.previewFeatures) expect(model.previewFeatures).toEqual(wanted.previewFeatures);
  checkOperations(model, wanted);
}

/** What a case that expects diagnostics also expects of the model: tables, preview features, operations. */
function checkBesideDiagnostics(model: ResolvedModel | undefined, wanted: Case["expect"]): void {
  if (
    !wanted.tables &&
    !wanted.previewFeatures &&
    !wanted.operations &&
    wanted.qualityResults === undefined
  )
    return;
  expect(model, "the project resolves").toBeDefined();
  if (wanted.tables) checkTables(model!, wanted.tables);
  if (wanted.previewFeatures) expect(model!.previewFeatures).toEqual(wanted.previewFeatures);
  checkOperations(model!, wanted);
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

/** The packs, each with the case's `platformFields` in place of its own. */
function packsFor(testCase: Case): PackInfo[] {
  const fields = testCase.platformFields ?? {};
  return packs.map((pack) =>
    Object.hasOwn(fields, pack.id) ? { ...pack, platformFields: fields[pack.id] } : pack,
  );
}

/** The diagnostics a pack's problems become, each flattened as the cases write them. */
function checkPackProblems(testCase: Case): void {
  const actual = environmentsDiagnostics(testCase.packProblems!).map(
    ({ code, severity, message, hint, location }) => ({
      code,
      severity,
      message,
      hint,
      ...location,
    }),
  );
  expect(actual).toEqual(testCase.expect.diagnostics);
}

function resolveCase(testCase: Case) {
  return resolveDefinitions(memoryFiles(testCase.files), {
    packs: packsFor(testCase),
    environment: testCase.environment,
    envvars: testCase.envvars ?? {},
    ...(testCase.missingEnvvars && { missingEnvvars: testCase.missingEnvvars }),
    ...(testCase.deployTime && { deployTime: true }),
    ...(testCase.environmentsTogether && { environmentsTogether: true }),
    ...(testCase.replaceMe && { replaceMe: testCase.replaceMe }),
    ...(testCase.sourceTables && { sourceTables: true }),
  });
}

describe("conformance", () => {
  const names = readdirSync(folder)
    .filter((name) => /^\d/.test(name))
    .sort();
  for (const name of names) {
    const testCase = parse(readFileSync(join(folder, name), "utf8")) as Case;
    it(`${name}: ${testCase.description}`, () => {
      if (testCase.packProblems) return checkPackProblems(testCase);
      if (testCase.reference) return checkReference(testCase as ReferenceCase);
      if (testCase.expect.refused) {
        expect(() => resolveCase(testCase)).toThrow(new Error(testCase.expect.refused));
        expect(packLoadProblem(packsFor(testCase))?.message).toBe(testCase.expect.refused);
        return;
      }
      const result = resolveCase(testCase);
      checkSeverities([...result.diagnostics, ...result.accepted.map((item) => item.diagnostic)]);
      const { diagnostics, accepted } = testCase.expect;
      if (accepted) checkAccepted(result.accepted, accepted);
      // With or without a model, so before either is judged.
      if (testCase.expect.sourceTables !== undefined)
        expect(result.sourceTables ?? null).toEqual(testCase.expect.sourceTables);
      // A case that expects only information still resolves, so its model can be checked too.
      if (diagnostics) checkBesideDiagnostics(result.model, testCase.expect);
      if (diagnostics) {
        const actual = result.diagnostics.map(flattened);
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
