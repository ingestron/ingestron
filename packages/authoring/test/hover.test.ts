// Hover answers "why is this value what it is?" from each step's origins.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hoverAt } from "../src/hover.js";
import { openProject } from "../src/project.js";

const retail = join(import.meta.dirname, "../../../samples/starters/retail");
const project = openProject(retail, new Map());
const text = readFileSync(join(retail, "flows/shop.yaml"), "utf8");
const hover = (needle: string, plus = 1) =>
  hoverAt(project, "flows/shop.yaml", text, text.indexOf(needle) + plus, "dev");

describe("hover", () => {
  it("explains a table: its full name, methods, and where each setting came from", () => {
    const shown = hover("  orders:", 3)!;
    expect(shown).toContain("`dev_sales`.`bronze`.`orders`");
    expect(shown).toContain("**store**: `streaming-table` (databricks)");
    expect(shown).toContain("| `cluster_by` | `auto` | standard, fixed (standard.yaml:15) |");
    expect(shown).toContain("| `mode` | `upsert` | this table (flows/shop.yaml:11) |");
    expect(shown).not.toContain("| `format` |");
    expect(shown).toContain("Pack defaults: `format: parquet`, `schema_evolution: addNewColumns`");
  });

  it("explains one setting under with: its value and where it was set, then what it is", () => {
    const shown = hover("mode: upsert")!;
    expect(
      shown.startsWith("`mode` for `orders`: `upsert`, set by this table (flows/shop.yaml:11)."),
    ).toBe(true);
    expect(shown).toContain("**mode**: How rows are kept.");
  });

  it("describes a field from the schema, with an example and its page", () => {
    expect(hover("source:")).toBe(
      "**source**: Id of the Connection to read from.\n\nFor example: `shop`.\n\n[Reference](/docs/reference/documents#flow-source)",
    );
  });
});

describe("hover on a described field", () => {
  const erp = join(import.meta.dirname, "../../../samples/starters/private-sql-server");
  const standard = readFileSync(join(erp, "standard.yaml"), "utf8");
  const docs = (link: string) => `https://docs.example.com${link}`;
  const at = (needle: string, plus: number) =>
    hoverAt(
      openProject(erp, new Map()),
      "standard.yaml",
      standard,
      standard.indexOf(needle) + plus,
      "dev",
      {
        docs,
      },
    )!;

  it("explains a setting's key: meaning, each value, default, where it goes, and its page", () => {
    const shown = at("mode: incremental", 1);
    expect(shown).toContain("**mode**: What each window copies.");
    expect(shown).toContain(
      "- `incremental`: Only rows changed in the window, by watermark_column.",
    );
    expect(shown).toContain("Default: `full`.");
    expect(shown).toContain("Usually set in a flow or transform.");
    expect(shown).toContain(
      "[Reference](https://docs.example.com/docs/reference/packs/adf#adf-copy-mode)",
    );
  });

  it("explains the value written", () => {
    const shown = at("mode: incremental", 8);
    expect(shown).toContain("`incremental`: Only rows changed in the window, by watermark_column.");
    expect(shown).not.toContain("- `full`");
  });

  it("explains a method's name under settings, with what chose it", () => {
    const shown = at("adf-copy:", 2);
    expect(shown).toContain("**adf-copy**: Azure Data Factory copies the table");
    expect(shown).toContain("chosen by the adf pack's rule for `connectivity: private`");
    expect(shown).toContain(
      "[Reference](https://docs.example.com/docs/reference/packs/adf#adf-copy)",
    );
  });
});

describe("hover on a reference", () => {
  it("says what it resolves to for the environment", () => {
    const project = openProject(retail, new Map());
    const text = readFileSync(join(retail, "connections/shop.yaml"), "utf8");
    const shown = hoverAt(
      project,
      "connections/shop.yaml",
      text,
      text.indexOf("values.storage") + 3,
      "prod",
      {
        docs: (path) => path,
      },
    );
    expect(shown).toContain(
      "`${values.storage}` is `abfss://landing@retailprod.dfs.core.windows.net` in prod.",
    );
  });

  it("never shows a secret", () => {
    const project = openProject(retail, new Map());
    const text =
      "apiVersion: ingestron.io/v1\nkind: Connection\nid: x\nsettings: { password: ${secret:pw} }\n";
    const shown = hoverAt(project, "connections/x.yaml", text, text.indexOf("secret:") + 2, "dev", {
      docs: (path) => path,
    });
    expect(shown ?? "").not.toContain("is `");
  });
});
