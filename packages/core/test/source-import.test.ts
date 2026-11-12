// Importing source metadata: the conformance cases in spec/cli/conformance/sources/imports/.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { SourceMetadataDoc } from "@ingestron/definitions";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  importSource,
  readSourceRecipe,
  sourceChangesText,
  sourceFileFor,
  withSourcesImport,
  type SourceRecipe,
} from "../src/index.js";

interface ImportCase {
  name: string;
  connection: string;
  current?: string;
  file: string;
  input: string;
  recipe?: string;
  object?: string;
  environment?: string;
  at: string;
  text?: string;
  changes?: unknown[];
  notes?: string[];
  summary?: string[];
  refused?: string[];
  forbidden?: string[];
}

interface Cases {
  imports: ImportCase[];
  files: { path: string; expected: { connection: string; object?: string } | null }[];
  projectImports: { name: string; project: string; document: string; expected: string | null }[];
}

const conformance = resolve(import.meta.dirname, "../../../spec/cli/conformance/sources");
const fixture = (name: string) => readFileSync(join(conformance, "imports", name), "utf8");
const cases = JSON.parse(fixture("cases.json")) as Cases;

function recipeOf(name: string): SourceRecipe {
  const file = `recipes/${name}.yaml`;
  return readSourceRecipe(readFileSync(join(conformance, file), "utf8"), file);
}

function run(item: ImportCase): ReturnType<typeof importSource> {
  return importSource({
    connection: item.connection,
    ...(item.current !== undefined && { current: fixture(item.current) }),
    file: item.file,
    contents: new Uint8Array(readFileSync(join(conformance, "imports", item.input))),
    ...(item.recipe !== undefined && { recipe: recipeOf(item.recipe) }),
    ...(item.object !== undefined && { object: item.object }),
    ...(item.environment !== undefined && { environment: item.environment }),
    at: item.at,
  });
}

describe("importSource: the conformance cases", () => {
  for (const item of cases.imports) {
    it(item.name, () => {
      const result = run(item);
      for (const text of item.forbidden ?? []) expect(JSON.stringify(result)).not.toContain(text);
      if (item.refused) return expect(result).toStrictEqual({ refused: item.refused });
      if ("refused" in result) throw new Error(result.refused.join("\n"));
      expect(result.text).toBe(fixture(item.text!));
      expect(result.changes).toStrictEqual(item.changes);
      expect(result.notes).toStrictEqual(item.notes);
      const summary = sourceChangesText(item.connection, result.changes, result.notes);
      expect(summary).toBe(item.summary!.map((line) => `${line}\n`).join(""));
      for (const text of item.forbidden ?? []) expect(summary).not.toContain(text);
    });
  }
});

describe("importSource: the document", () => {
  const first = cases.imports[0]!;

  it("differs only in the time captured when the same file is imported twice", () => {
    const again = cases.imports.find((item) => item.text === "erp.again.yaml")!;
    const result = run(again);
    if ("refused" in result) throw new Error(result.refused.join("\n"));
    const times = /at: [0-9TZ:-]+/g;
    expect(result.text.replace(times, "at: …")).toBe(
      fixture(again.current!).replace(times, "at: …"),
    );
  });

  it("writes the time of the import in UTC, to the second", () => {
    const result = run({ ...first, at: "2026-11-12T10:30:00.250+01:00" });
    expect(result).toStrictEqual(run(first));
  });

  it("reads back what it writes as the same document", () => {
    const result = run(first);
    if ("refused" in result) throw new Error(result.refused.join("\n"));
    const again = importSource({
      connection: "erp",
      current: result.text,
      file: first.file,
      contents: new Uint8Array(readFileSync(join(conformance, "imports", first.input))),
      recipe: recipeOf("sqlserver"),
      at: first.at,
    });
    expect(again).toStrictEqual({ ...result, changes: [] });
  });

  it("refuses a current text whose columns are not a metadata document's", () => {
    const broken = fixture("erp.first.yaml").replace("required: true, ", "");
    expect(run({ ...first, current: "erp.first.yaml" })).not.toHaveProperty("refused");
    const input = { connection: "erp", file: first.file, contents: "", at: first.at };
    expect(importSource({ ...input, current: broken })).toStrictEqual({
      refused: ['sources/erp.yaml is not the source metadata of "erp".'],
    });
  });

  it("takes the object from the path before the object given", () => {
    const sample = cases.imports[1]!;
    expect(run({ ...sample, object: "Other" })).toStrictEqual(run(sample));
  });

  it("records the environment given over the current one", () => {
    const sample = cases.imports[1]!;
    const result = run({ ...sample, environment: "prod" });
    expect("text" in result && result.text).toContain("\nenvironment: prod\n");
  });

  it("quotes a value YAML would read as another value", () => {
    const result = importSource({
      connection: "shop",
      file: "sources/shop/2024.csv",
      contents: 'true,null,1.5,a: b,#x,"a,b"\n1,2,3,4,5,6\n',
      at: "2026-11-12T09:30:00Z",
    });
    expect("text" in result && result.text).toContain(
      [
        '  - object: "2024"',
        "    captured: { at: 2026-11-12T09:30:00Z, from: sample, file: sources/shop/2024.csv }",
        "    columns:",
        '      - { name: "true", logicalType: integer, required: false }',
        '      - { name: "null", logicalType: integer, required: false }',
        '      - { name: "1.5", logicalType: integer, required: false }',
        '      - { name: "a: b", logicalType: integer, required: false }',
        '      - { name: "#x", logicalType: integer, required: false }',
        '      - { name: "a,b", logicalType: integer, required: false }',
      ].join("\n"),
    );
    const names = ["true", "null", "1.5", "a: b", "#x", "a,b"];
    const written = parse("text" in result ? result.text : "") as SourceMetadataDoc;
    expect(written.tables[0]!.object).toBe("2024");
    expect(written.tables[0]!.columns.map((column) => column.name)).toStrictEqual(names);
  });

  it("quotes text YAML cannot hold as it is, and reads it back the same", () => {
    const names = ["tab\there", "nel\u0085", "del\u007f", "é ü", "' quote", "- dash"];
    const result = importSource({
      connection: "shop",
      file: "sources/shop/t.json",
      contents: JSON.stringify([Object.fromEntries(names.map((name) => [name, 1]))]),
      at: "2026-11-12T09:30:00Z",
    });
    const written = parse("text" in result ? result.text : "") as SourceMetadataDoc;
    expect(written.tables[0]!.columns.map((column) => column.name)).toStrictEqual(names);
  });
});

describe("sourceFileFor", () => {
  for (const { path, expected } of cases.files)
    it(`gives ${JSON.stringify(expected)} for ${path}`, () => {
      expect(sourceFileFor(path)).toStrictEqual(expected ?? undefined);
    });
});

describe("withSourcesImport", () => {
  for (const item of cases.projectImports)
    it(item.name, () => {
      const result = withSourcesImport(fixture(item.project), item.document);
      expect(result).toBe(item.expected === null ? undefined : fixture(item.expected));
    });

  it("adds a list of imports when project.yaml has none", () => {
    expect(withSourcesImport("id: shop\n", "sources/erp.yaml")).toBe(
      "id: shop\nimports:\n  - sources/erp.yaml\n",
    );
  });

  it("keeps CRLF line ends", () => {
    const text = "id: shop\r\nimports:\r\n  - flows/*.yaml\r\n";
    expect(withSourcesImport(text, "sources/erp.yaml")).toBe(
      "id: shop\r\nimports:\r\n  - flows/*.yaml\r\n  - sources/erp.yaml\r\n",
    );
  });
});
