// Importing source metadata: names YAML cannot hold as they are are quoted and read back the same.
import type { SourceMetadataDoc } from "@ingestron/definitions";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { importSource } from "../src/index.js";

describe("importSource: the document's YAML", () => {
  it("quotes names YAML cannot start a plain value with or reads as another value, and reads them back", () => {
    // A whole number is first: a JSON object lists its keys that way.
    const names = [
      "123",
      "@x",
      "*x",
      "*",
      "%x",
      "`x",
      "#x",
      "true",
      "1abc",
      "yes",
      "No",
      "ON",
      "off",
      "y",
      "N",
    ];
    const result = importSource({
      connection: "shop",
      file: "sources/shop/t.json",
      contents: JSON.stringify([Object.fromEntries(names.map((name) => [name, 1]))]),
      at: "2026-11-12T09:30:00Z",
    });
    const text = "text" in result ? result.text : "";
    expect(text).toContain('{ name: "yes", logicalType: integer, required: false }');
    expect(text).toContain('{ name: "@x", logicalType: integer, required: false }');
    const written = parse(text) as SourceMetadataDoc;
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
