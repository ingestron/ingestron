// Catalogue feedback survives unrelated load errors without supplying a model.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { memoryFiles } from "@ingestron/config";
import { resolveDefinitions } from "../src/index.js";
const fixture = parse(
  readFileSync(
    new URL(
      "../../../spec/definitions/conformance/186h-source-unfinished-document.yaml",
      import.meta.url,
    ),
    "utf8",
  ),
) as { files: Record<string, string> };
const run = (files: Record<string, string>) =>
  resolveDefinitions(memoryFiles(files), { packs: [], environment: "dev" });
describe("partial source feedback", () => {
  it("keeps the missing header and gives a source replacement without producing a model", () => {
    const result = run(fixture.files);
    expect(result.ok).toBe(false);
    expect(result.model).toBeUndefined();
    expect(result.diagnostics.map((item) => item.code)).toEqual([
      "MISSING_HEADER",
      "TABLE_NO_COLUMNS",
    ]);
    expect(result.diagnostics[1]?.fixes?.[0]?.edits).toEqual([
      { file: "sales.yaml", pointer: "/tables/orders/object", set: "orders" },
    ]);
  });
  it("does not infer absence from unimported or ambiguous catalogues or unresolved names", () => {
    const noImport = {
      ...fixture.files,
      "project.yaml": fixture.files["project.yaml"]!.replace(', "sources/*.yaml"', ""),
    };
    const duplicate = {
      ...fixture.files,
      "sources/other.yaml": fixture.files["sources/shop.yaml"]!.replace("id: shop", "id: another"),
    };
    const unknown = {
      ...fixture.files,
      "sales.yaml": fixture.files["sales.yaml"]!.replace("orders2", "${envvar:TABLE}"),
    };
    for (const files of [noImport, duplicate, unknown])
      expect(run(files).diagnostics.some((item) => item.code === "TABLE_NO_COLUMNS")).toBe(false);
  });
  it("keeps contract source checks and respects a warn setting", () => {
    const files = {
      ...fixture.files,
      "sales.yaml": fixture.files["sales.yaml"]!.replace(
        "object: orders2",
        "object: orders2, contract: orders",
      ),
      "standard.yaml": fixture.files["standard.yaml"]! + "sources: { breaking: warn }\n",
    };
    expect(run(files).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "SOURCE_TABLE_GONE",
        severity: "warning",
        location: expect.objectContaining({ file: "sales.yaml", line: 6 }),
      }),
    );
  });
});
