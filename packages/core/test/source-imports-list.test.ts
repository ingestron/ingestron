// withSourcesImport: where the path goes in a flow list or a block list written in different ways.
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { withSourcesImport } from "../src/sources/index.js";

const path = "sources/erp.yaml";

describe("withSourcesImport, a flow list", () => {
  const cases: [string, string, string][] = [
    [
      "plain items",
      "imports: [flows/*.yaml, contracts/*.yaml]\n",
      "imports: [flows/*.yaml, contracts/*.yaml, sources/erp.yaml]\n",
    ],
    [
      "quoted items",
      "imports: [\"flows/*.yaml\", 'contracts/*.yaml']\n",
      "imports: [\"flows/*.yaml\", 'contracts/*.yaml', sources/erp.yaml]\n",
    ],
    ["an item with a trailing comma", "imports: [flows/*.yaml, ]\n", ""],
    [
      "a space before the close",
      "imports: [flows/*.yaml ]\n",
      "imports: [flows/*.yaml, sources/erp.yaml ]\n",
    ],
    ["an empty list", "imports: []\n", "imports: [sources/erp.yaml]\n"],
    ["an empty list with a space", "imports: [ ]\n", ""],
    ["a list over several lines", "imports: [\n  flows/*.yaml,\n  contracts/*.yaml\n]\n", ""],
    [
      "a comment after the list",
      "imports: [flows/*.yaml] # the flows\n",
      "imports: [flows/*.yaml, sources/erp.yaml] # the flows\n",
    ],
    ["a comment inside the list", "imports: [\n  flows/*.yaml, # the flows\n]\n", ""],
  ];
  for (const [name, text, expected] of cases)
    it(`adds the path to ${name}, keeping every other character`, () => {
      const result = withSourcesImport(text, path);
      expect(result).toBeDefined();
      const imports = parse(result!).imports as string[];
      expect(imports.at(-1)).toBe(path);
      expect(imports).toHaveLength((parse(text).imports as string[]).length + 1);
      if (expected !== "") expect(result).toBe(expected);
    });
});

describe("withSourcesImport, a block list", () => {
  it("adds the path after the last item, at its indent, and keeps the comments", () => {
    const text = "imports:\n  - flows/*.yaml # the flows\n  - contracts/*.yaml\nname: x\n";
    expect(withSourcesImport(text, path)).toBe(
      "imports:\n  - flows/*.yaml # the flows\n  - contracts/*.yaml\n  - sources/erp.yaml\nname: x\n",
    );
  });

  it("keeps the line ending of a file written with \\r\\n", () => {
    const text = "imports:\r\n  - flows/*.yaml\r\n";
    expect(withSourcesImport(text, path)).toBe(
      "imports:\r\n  - flows/*.yaml\r\n  - sources/erp.yaml\r\n",
    );
  });

  it("adds the path after a last item with no line break at the end of the file", () => {
    expect(withSourcesImport("imports:\n- flows/*.yaml", path)).toBe(
      "imports:\n- flows/*.yaml\n- sources/erp.yaml",
    );
  });

  it("adds the path after a quoted last item", () => {
    const result = withSourcesImport('imports:\n  - "flows/*.yaml"\n', path);
    expect(result).toBe('imports:\n  - "flows/*.yaml"\n  - sources/erp.yaml\n');
  });
});
