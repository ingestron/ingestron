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
  type JsonSchema,
  type Limits,
} from "../src/core.js";

interface ConformanceCase {
  description: string;
  environment?: string;
  envvars?: Record<string, string>;
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
    fixed?: { diagnostic: number; title: string; files: Record<string, string> }[];
  };
}

const casesFolder = join(import.meta.dirname, "../../../spec/config/conformance");
const caseFiles = readdirSync(casesFolder).filter((name) => name.endsWith(".yaml"));

describe("conformance", () => {
  it.each(caseFiles)("%s", (caseFile) => {
    const testCase = parse(readFileSync(join(casesFolder, caseFile), "utf8")) as ConformanceCase;

    const result = resolveProject(memoryFiles(testCase.files), {
      kinds: (testCase.kinds ?? []).map((kind) => defineKind(kind)),
      environment: testCase.environment,
      envvars: testCase.envvars ?? {},
      limits: testCase.limits,
    });

    if (testCase.expect.documents) {
      expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      const documents = result.project?.documents.map((document) => ({
        kind: document.kind,
        id: document.id,
        value: document.value,
      }));
      expect(documents).toEqual(testCase.expect.documents);
    }

    if (testCase.expect.diagnostics) {
      const actual = result.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        severity: diagnostic.severity,
        message: diagnostic.message,
        hint: diagnostic.hint,
        fixes: diagnostic.fixes?.map((fix) => fix.title),
        ...diagnostic.location,
      }));
      expect(actual).toHaveLength(testCase.expect.diagnostics.length);
      testCase.expect.diagnostics.forEach((expected, index) => {
        expect(actual[index]).toMatchObject(expected);
      });
    }

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
