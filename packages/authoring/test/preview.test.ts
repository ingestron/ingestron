// Generated files in memory, exactly as the CLI would write them.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generatedFiles, generatedForTable, tableAtCursor } from "../src/preview.js";
import { openProject } from "../src/project.js";
import { appliedSample } from "./applied.js";

const templates = join(import.meta.dirname, "../../cli/project-templates");

describe("generated files", () => {
  it("match what the CLI wrote to build/", () => {
    const retail = appliedSample("retail");
    const files = generatedFiles(openProject(retail, new Map()), "dev");
    if (!Array.isArray(files)) throw new Error(files.problems);
    const orders = files.find((file) => file.path === "build/dev/src/retail/bronze/orders.sql");
    expect(orders?.text).toBe(readFileSync(join(retail, orders!.path), "utf8"));
  });

  it("are found for a table, in every pack's folder", () => {
    const erp = join(templates, "private-sql-server");
    const files = generatedFiles(openProject(erp, new Map()), "dev");
    if (!Array.isArray(files)) throw new Error(files.problems);
    expect(generatedForTable(files, "invoices").map((file) => file.path)).toEqual([
      "build/dev/databricks/src/erp/bronze/invoices.sql",
      "build/dev/adf/pipeline/pl_erp_erp.json",
    ]);
  });

  it("include the Synapse view of a table and of a transform", () => {
    const synapse = join(import.meta.dirname, "../../cli/test/fixtures/synapse-views");
    const files = generatedFiles(openProject(synapse, new Map()), "dev");
    if (!Array.isArray(files)) throw new Error(files.problems);
    expect(generatedForTable(files, "invoices").map((file) => file.path)).toEqual([
      "build/dev/adf/pipeline/pl_sales_erp.json",
      "build/dev/synapse/views.sql",
    ]);
    expect(generatedForTable(files, "customer_totals").map((file) => file.path)).toEqual([
      "build/dev/synapse/views.sql",
    ]);
  });

  it("include a DuckDB table's own SQL, in the cloud and the local environment", () => {
    const local = join(import.meta.dirname, "../../cli/test/fixtures/duckdb-local");
    const project = openProject(local, new Map());
    const cloud = generatedFiles(project, "dev");
    if (!Array.isArray(cloud)) throw new Error(cloud.problems);
    expect(generatedForTable(cloud, "invoices").map((file) => file.path)).toEqual([
      "build/dev/adf/pipeline/pl_sales_erp.json",
      "build/dev/duckdb/tables/bronze.invoices.sql",
    ]);
    const onLaptop = generatedFiles(project, "local");
    if (!Array.isArray(onLaptop)) throw new Error(onLaptop.problems);
    expect(generatedForTable(onLaptop, "customer_totals").map((file) => file.path)).toEqual([
      "build/local/duckdb/tables/silver.customer_totals.sql",
    ]);
  });

  it("say what is wrong when the project has problems", () => {
    const retail = join(templates, "retail");
    const broken = openProject(
      retail,
      new Map([[join(retail, "flows/shop.yaml"), "kind: Flow\n"]]),
    );
    const result = generatedFiles(broken, "dev");
    expect(Array.isArray(result) ? "files" : result.problems).toContain(
      "the definitions have problems",
    );
  });
});

describe("the table at the cursor", () => {
  it("is the flow table the cursor is in, or the transform", () => {
    const flow = "kind: Flow\ntables:\n  orders:\n    object: orders\n";
    expect(tableAtCursor(flow, flow.indexOf("object"))).toBe("orders");
    const transform = "kind: Transform\nid: daily\ninputs: [orders]\n";
    expect(tableAtCursor(transform, transform.indexOf("inputs"))).toBe("daily");
  });
});
