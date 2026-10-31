// Completing a transform's inputs in its code: declared inputs first, never
// itself or a table that depends on it, and other tables with the edit that
// adds them to `inputs`.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { completionsAt } from "../src/completion.js";
import { openProject } from "../src/project.js";

const retail = join(import.meta.dirname, "../../cli/project-templates/retail");
const read = (path: string) => readFileSync(join(retail, path), "utf8");

/** Retail where daily_sales declares only orders, and weekly reads daily_sales. */
function project(code: { file: string; text: string }) {
  return openProject(
    retail,
    new Map([
      [
        join(retail, "transforms/daily_sales.yaml"),
        read("transforms/daily_sales.yaml").replace(
          "inputs: [orders, customers]",
          "inputs: [orders]",
        ),
      ],
      [
        join(retail, "transforms/weekly.yaml"),
        "apiVersion: ingestron.io/v1\nkind: Transform\nid: weekly\ninputs: [daily_sales]\ncode: SELECT 1\n",
      ],
      [join(retail, code.file), code.text],
    ]),
  );
}

describe("inputs in SQL", () => {
  it("offers declared inputs first, then other tables with the edit that adds them", () => {
    const text = "SELECT * FROM {{ tables.";
    const items = completionsAt(
      project({ file: "transforms/daily_sales.sql", text }),
      "transforms/daily_sales.sql",
      text,
      text.length,
      "dev",
    );
    expect(items.map((item) => [item.label, item.detail])).toEqual([
      ["orders", "input"],
      ["customers", "not an input yet: adds it to inputs"],
    ]);
    expect(items[1]?.edits).toMatchObject([
      { file: "transforms/daily_sales.yaml", text: expect.stringContaining("customers") },
    ]);
  });
});

describe("inputs in Python", () => {
  it('completes tables["…"] in a transform\'s code file, never with itself', () => {
    const pyspark = join(import.meta.dirname, "../../cli/project-templates/pyspark");
    const file = "transforms/monthly_revenue.py";
    const text = 'def transform(tables):\n    return tables["';
    const python = openProject(pyspark, new Map([[join(pyspark, file), text]]));
    const items = completionsAt(python, file, text, text.length, "dev");
    expect(items.map((item) => item.label)).toEqual(["invoices"]);
    expect(items[0]?.detail).toBe("input");
  });
});
