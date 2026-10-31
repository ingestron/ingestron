// Suggested values insert valid YAML where the cursor is: flow forms inside
// { } and [ ], block forms elsewhere; and lists offer their items.
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { completionsAt } from "../src/completion.js";
import { openProject } from "../src/project.js";

const project = openProject(
  join(import.meta.dirname, "../../../samples/starters/pyspark"),
  new Map(),
);
const suggest = (file: string, text: string, at = text.length) =>
  completionsAt(project, file, text, at, project.environments[0]).map(
    (item) => item.snippet ?? item.insertText ?? item.label,
  );

describe("inside { } over several lines", () => {
  it("offers a list in flow style, never a dash", () => {
    const text =
      "apiVersion: ingestron.io/v1\nkind: Flow\nid: b\nsource: s\ntables:\n  invoices: { object: i, contract: c,\n    expectations:";
    const offered = suggest("flows/x.yaml", text);
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.every((text) => !text.includes("- "))).toBe(true);
    expect(offered).toContain(" [$0]");
  });

  it("offers a mapping in flow style", () => {
    const offered = suggest("project.yaml", "id: pyspark\nenvironments:\n  dev: {\n    values:");
    expect(offered).toContain(" { $0 }");
    expect(offered.every((text) => !text.startsWith("\n"))).toBe(true);
  });
});

describe("a new item in [ ] of mappings", () => {
  it("offers a mapping to fill, not bare keys", () => {
    const text =
      "apiVersion: ingestron.io/v1\nkind: Flow\nid: b\nsource: s\ntables:\n  invoices: { object: i, contract: c, expectations: [ ] }";
    const offered = suggest("flows/x.yaml", text, text.indexOf("[ ]") + 2);
    expect(offered).toEqual(["{ $0 }"]);
  });
});

describe("packs", () => {
  const head = "apiVersion: ingestron.io/v1\nkind: Standard\nid: s\n";

  it("offers the packs not yet listed as items", () => {
    const text = `${head}packs: [databricks@1, ]`;
    expect(suggest("standard.yaml", text, text.length - 1)).toEqual(["adf@1"]);
  });

  it("offers the pack lists as a value", () => {
    expect(suggest("standard.yaml", `${head}packs:`)).toEqual(
      expect.arrayContaining([" [databricks@1]", " [databricks@1, adf@1]"]),
    );
  });
});
