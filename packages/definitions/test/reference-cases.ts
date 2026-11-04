// The field reference conformance cases (specification sections 9 and 10): a document
// kind, or a method of a data-only pack, described and compared with what the case expects.
import { expect } from "vitest";
import {
  documentReference,
  methodReference,
  type Method,
  type PackInfo,
  type referenceKinds,
} from "../src/index.js";

/** A case with `reference` in place of `files`. */
export interface ReferenceCase {
  reference: { kind?: keyof typeof referenceKinds; method?: string } & Partial<Method>;
  expect: {
    /** Every entry's path, in order. */
    paths?: string[];
    /** Entries found by path, compared on the keys given; `null` for a key the entry lacks. */
    fields?: ({ path: string } & Record<string, unknown>)[];
    /** Paths with no entry. */
    absent?: string[];
  };
}

/** The field reference a case describes: a document kind, or a method of the pack `reference`. */
function referenceOf(reference: ReferenceCase["reference"]) {
  if (reference.kind) return documentReference(reference.kind);
  const { method: id = "", ...method } = reference;
  const pack = {
    id: "reference",
    methods: { [id]: { action: "ingest", description: "", produces: "files", ...method } },
  } as unknown as PackInfo;
  return methodReference(pack, id);
}

/** The entries' paths, the entries the case names, and the paths with no entry. */
export function checkReference(testCase: ReferenceCase): void {
  const fields = referenceOf(testCase.reference);
  const byPath = new Map(fields.map((field) => [field.path.join("."), field]));
  const { paths, fields: wanted = [], absent = [] } = testCase.expect;
  if (paths) expect(fields.map((field) => field.path.join("."))).toEqual(paths);
  for (const { path, ...keys } of wanted) {
    const field = byPath.get(path) as Record<string, unknown> | undefined;
    expect(field, path).toBeDefined();
    for (const [key, value] of Object.entries(keys)) {
      if (value === null) expect(field, `${path} has no ${key}`).not.toHaveProperty(key);
      else expect(field?.[key], `${path}: ${key}`).toEqual(value);
    }
  }
  for (const path of absent) expect(byPath.has(path), `${path} has no entry`).toBe(false);
}
