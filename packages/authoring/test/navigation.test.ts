// Go to definition, references and rename across a project's files.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { definitionAt, referencesAt, type Place } from "../src/navigation.js";
import { renameAt } from "../src/rename.js";
import { openProject } from "../src/project.js";

const retail = join(import.meta.dirname, "../../cli/project-templates/retail");
const project = openProject(retail, new Map());
const read = (path: string) => readFileSync(join(retail, path), "utf8");
const at = (path: string, text: string, plus = 0) => read(path).indexOf(text) + plus;
const shown = (place: Place | undefined) =>
  place &&
  `${place.file}:${read(place.file).slice(place.range[0], place.range[1])}@${place.range[0]}`;

describe("go to definition", () => {
  it("goes from a flow's source to the connection", () => {
    const place = definitionAt(
      project,
      "flows/shop.yaml",
      at("flows/shop.yaml", "source: shop", 9),
    );
    expect(shown(place)).toBe(`connections/shop.yaml:shop@${at("connections/shop.yaml", "shop")}`);
  });

  it("goes from a table's contract to the contract", () => {
    const place = definitionAt(project, "flows/shop.yaml", at("flows/shop.yaml", "shop.orders", 2));
    expect(place?.file).toBe("contracts/orders.yaml");
  });

  it("goes from a transform input and from {{ tables.x }} to the flow table", () => {
    const fromInput = definitionAt(
      project,
      "transforms/daily_sales.yaml",
      at("transforms/daily_sales.yaml", "orders", 1),
    );
    const fromSql = definitionAt(
      project,
      "transforms/daily_sales.sql",
      at("transforms/daily_sales.sql", "tables.orders", 8),
    );
    const table = `flows/shop.yaml:orders@${at("flows/shop.yaml", "  orders:") + 2}`;
    expect([shown(fromInput), shown(fromSql)]).toEqual([table, table]);
  });

  it("goes from ${values.x} to project.yaml and from ${file:…} to the file", () => {
    const value = definitionAt(
      project,
      "connections/shop.yaml",
      at("connections/shop.yaml", "values.storage", 8),
    );
    expect(shown(value)).toBe(`project.yaml:storage@${at("project.yaml", "storage")}`);
    const file = definitionAt(
      project,
      "transforms/daily_sales.yaml",
      at("transforms/daily_sales.yaml", "daily_sales.sql", 3),
    );
    expect(file).toEqual({ file: "transforms/daily_sales.sql", range: [0, 0] });
  });

  it("has nothing for text that is not a reference", () => {
    expect(
      definitionAt(project, "flows/shop.yaml", at("flows/shop.yaml", "object: orders", 9)),
    ).toBeUndefined();
  });
});

describe("references and rename", () => {
  it("finds the connection's id and the flow's source, not the flow that is also called shop", () => {
    const places = referencesAt(
      project,
      "connections/shop.yaml",
      at("connections/shop.yaml", "id: shop", 5),
    );
    expect(places.map((place) => place.file).sort()).toEqual([
      "connections/shop.yaml",
      "flows/shop.yaml",
    ]);
    expect(places.find((place) => place.file === "flows/shop.yaml")?.range[0]).toBe(
      at("flows/shop.yaml", "source: shop", 8),
    );
  });

  it("renames a table everywhere it is used, and nowhere else", () => {
    const edits = renameAt(
      project,
      "flows/shop.yaml",
      at("flows/shop.yaml", "  orders:", 3),
      "sales_orders",
    );
    expect(Object.keys(edits ?? {}).sort()).toEqual([
      "flows/shop.yaml",
      "transforms/daily_sales.sql",
      "transforms/daily_sales.yaml",
    ]);
    expect(edits?.["flows/shop.yaml"]).toHaveLength(1);
  });
});

describe("rename covers every place a name is used", () => {
  const fixtures = join(import.meta.dirname, "../../cli/test/fixtures");

  it("renames a value in every environment that overrides it", () => {
    const folder = join(fixtures, "environments");
    const text = readFileSync(join(folder, "project.yaml"), "utf8");
    const edits = renameAt(
      openProject(folder, new Map()),
      "project.yaml",
      text.indexOf("host:") + 1,
      "hostname",
    );
    expect(edits?.["project.yaml"]).toHaveLength(2);
    expect(Object.keys(edits ?? {}).sort()).toEqual(["platform.yaml", "project.yaml"]);
  });

  it("renames a transform's table from its id, including inputs and {{ tables.x }}", () => {
    const folder = join(fixtures, "layers-and-transforms");
    const text = readFileSync(join(folder, "transforms/store_sales.yaml"), "utf8");
    const edits = renameAt(
      openProject(folder, new Map()),
      "transforms/store_sales.yaml",
      text.indexOf("id: store_sales") + 5,
      "shop_sales",
    );
    expect(Object.keys(edits ?? {}).sort()).toEqual([
      "transforms/region_sales.sql",
      "transforms/region_sales.yaml",
      "transforms/store_sales.yaml",
    ]);
  });
});

describe("PySpark inputs", () => {
  const pyspark = join(import.meta.dirname, "../../cli/project-templates/pyspark");

  it('renames tables["x"] in a transform\'s Python with the table', () => {
    const python = openProject(pyspark, new Map());
    const text = readFileSync(join(pyspark, "transforms/monthly_revenue.py"), "utf8");
    const at = text.indexOf('tables["invoices"]') + 'tables["'.length;
    const edits = renameAt(python, "transforms/monthly_revenue.py", at, "billing_invoices");
    expect(edits?.["transforms/monthly_revenue.py"]).toEqual([
      { range: [at, at + "invoices".length], text: "billing_invoices" },
    ]);
    expect(Object.keys(edits ?? {})).toContain("transforms/monthly_revenue.yaml");
  });

  it("leaves comments and Python that is not a transform's code alone", () => {
    const code = readFileSync(join(pyspark, "transforms/monthly_revenue.py"), "utf8").replace(
      "def transform(tables):",
      '# tables["invoices"] is the input\ndef transform(tables):',
    );
    const report = 'tables = {"invoices": "a label"}\nprint(tables["invoices"])\n';
    const python = openProject(
      pyspark,
      new Map([
        [join(pyspark, "transforms/monthly_revenue.py"), code],
        [join(pyspark, "scripts/report.py"), report],
      ]),
    );
    const at = code.indexOf('= tables["invoices"]') + '= tables["'.length;
    const edits = renameAt(python, "transforms/monthly_revenue.py", at, "billing_invoices");
    expect(edits?.["transforms/monthly_revenue.py"]).toEqual([
      { range: [at, at + "invoices".length], text: "billing_invoices" },
    ]);
    expect(edits?.["scripts/report.py"]).toBeUndefined();
  });
});
