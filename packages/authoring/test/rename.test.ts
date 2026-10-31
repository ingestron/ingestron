// Rename's refusals, and the ${file:…} paths that follow a moved file or folder.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openProject } from "../src/project.js";
import { fileMoveEdits, renameProblem } from "../src/rename.js";

const retail = join(import.meta.dirname, "../../cli/project-templates/retail");
const project = openProject(retail, new Map());
const read = (path: string) => readFileSync(join(retail, path), "utf8");
const at = (path: string, text: string, plus = 0) => read(path).indexOf(text) + plus;

describe("renameProblem", () => {
  const orders = at("flows/shop.yaml", "  orders:", 3);

  it("refuses a name another table already has", () => {
    expect(renameProblem(project, "flows/shop.yaml", orders, "customers")).toBe(
      '"customers" is already the name of a table. Choose another name.',
    );
  });

  it("refuses an empty name, and accepts a new one or the same one", () => {
    expect(renameProblem(project, "flows/shop.yaml", orders, " ")).toBe("Give a name.");
    expect(renameProblem(project, "flows/shop.yaml", orders, "sales_orders")).toBeUndefined();
    expect(renameProblem(project, "flows/shop.yaml", orders, "orders")).toBeUndefined();
  });

  it("refuses a connection id another connection has", () => {
    const shop = at("connections/shop.yaml", "id: shop", 5);
    const files = new Map([
      [
        join(retail, "connections/erp.yaml"),
        read("connections/shop.yaml").replace("id: shop", "id: erp"),
      ],
    ]);
    expect(renameProblem(openProject(retail, files), "connections/shop.yaml", shop, "erp")).toBe(
      '"erp" is already the id of a Connection. Choose another name.',
    );
  });
});

describe("fileMoveEdits", () => {
  it("updates ${file:…} when the file it names moves", () => {
    const edits = fileMoveEdits(project, "transforms/daily_sales.sql", "sql/sales/daily.sql");
    const at = read("transforms/daily_sales.yaml").indexOf("daily_sales.sql");
    expect(edits).toEqual({
      "transforms/daily_sales.yaml": [
        { range: [at, at + "daily_sales.sql".length], text: "../sql/sales/daily.sql" },
      ],
    });
  });

  it("updates every file under a folder that moves", () => {
    const edits = fileMoveEdits(project, "transforms", "models");
    const at = read("transforms/daily_sales.yaml").indexOf("daily_sales.sql");
    // The YAML moves with its code, so the relative path stays the same: no edit.
    expect(edits).toEqual({});
    const sqlOnly = fileMoveEdits(project, "transforms/daily_sales.sql", "transforms/x/d.sql");
    expect(sqlOnly["transforms/daily_sales.yaml"]?.[0]).toEqual({
      range: [at, at + "daily_sales.sql".length],
      text: "x/d.sql",
    });
  });

  it("updates a moved YAML file's own ${file:…} so it still finds the code", () => {
    const edits = fileMoveEdits(
      project,
      "transforms/daily_sales.yaml",
      "transforms/sales/daily.yaml",
    );
    const at = read("transforms/daily_sales.yaml").indexOf("daily_sales.sql");
    expect(edits).toEqual({
      "transforms/daily_sales.yaml": [
        { range: [at, at + "daily_sales.sql".length], text: "../daily_sales.sql" },
      ],
    });
  });
});
