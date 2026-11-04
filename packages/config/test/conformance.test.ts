// Runs every language-neutral case in spec/config/conformance against this implementation.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  applyEdits,
  defineKind,
  fixEdits,
  memoryFiles,
  resolveProject,
  type Diagnostic,
  type JsonSchema,
  type Limits,
} from "../src/core.js";

interface ConformanceCase {
  description: string;
  environment?: string;
  envvars?: Record<string, string>;
  missingEnvvars?: "error" | "information";
  deployEnvvars?: boolean;
  limits?: Partial<Limits>;
  kinds?: {
    apiVersion: string;
    kind: string;
    schema: JsonSchema;
    links?: Record<string, string>;
  }[];
  files: Record<string, string>;
  expect: {
    documents?: { kind: string; id: string; value: unknown }[];
    diagnostics?: Record<string, unknown>[];
    unsetEnvvars?: string[];
    envvarReferences?: {
      name: string;
      file: string;
      pointer: string;
      line?: number;
      setIn?: string;
    }[];
    fixed?: { diagnostic: number; title: string; files: Record<string, string> }[];
  };
}

const casesFolder = join(import.meta.dirname, "../../../spec/config/conformance");
const caseFiles = readdirSync(casesFolder).filter((name) => name.endsWith(".yaml"));

/**
 * The case's project, loaded; a successful load lists the unset references it left (section
 * 5.1), and the variable references it resolved when the case gives them (section 4.6).
 */
function load(testCase: ConformanceCase) {
  const result = resolveProject(memoryFiles(testCase.files), {
    kinds: (testCase.kinds ?? []).map((kind) => defineKind(kind)),
    environment: testCase.environment,
    envvars: testCase.envvars ?? {},
    missingEnvvars: testCase.missingEnvvars,
    deployEnvvars: testCase.deployEnvvars,
    limits: testCase.limits,
  });
  expect(result.project?.unsetEnvvars ?? []).toEqual(testCase.expect.unsetEnvvars ?? []);
  // Section 4.6: checked when the case gives it.
  if (testCase.expect.envvarReferences)
    expect(result.project?.envvarReferences).toEqual(testCase.expect.envvarReferences);
  return result;
}

/** The diagnostics, matched in order on the fields each expected one gives. */
function checkDiagnostics(found: readonly Diagnostic[], wanted: Record<string, unknown>[]): void {
  const actual = found.map((diagnostic) => ({
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    hint: diagnostic.hint,
    fixes: diagnostic.fixes?.map((fix) => fix.title),
    ...diagnostic.location,
  }));
  expect(actual).toHaveLength(wanted.length);
  wanted.forEach((expected, index) => expect(actual[index]).toMatchObject(expected));
}

describe("conformance", () => {
  it.each(caseFiles)("%s", (caseFile) => {
    const testCase = parse(readFileSync(join(casesFolder, caseFile), "utf8")) as ConformanceCase;

    const result = load(testCase);

    if (testCase.expect.documents) {
      expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      const documents = result.project?.documents.map((document) => ({
        kind: document.kind,
        id: document.id,
        value: document.value,
      }));
      expect(documents).toEqual(testCase.expect.documents);
    }

    if (testCase.expect.diagnostics)
      checkDiagnostics(result.diagnostics, testCase.expect.diagnostics);

    for (const fixed of testCase.expect.fixed ?? []) {
      const fix = result.diagnostics[fixed.diagnostic]?.fixes?.find(
        (item) => item.title === fixed.title,
      );
      expect(fix, fixed.title).toBeDefined();
      const edits = fixEdits(fix!, (file) => testCase.files[file]);
      const changed = Object.fromEntries(
        Object.keys(fixed.files).map((file) => [
          file,
          applyEdits(
            testCase.files[file] ?? "",
            edits.filter((edit) => edit.file === file),
          ),
        ]),
      );
      expect(changed).toEqual(fixed.files);
      expect(new Set(edits.map((edit) => edit.file))).toEqual(new Set(Object.keys(fixed.files)));
    }
  });
});
