// Generated files in memory, exactly as the CLI would write them.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generatedFiles, generatedForTable, tableAtCursor } from "../src/preview.js";
import { openProject } from "../src/project.js";

const examples = join(import.meta.dirname, "../../../samples");

describe("generated files", () => {
  it("match what the CLI wrote to build/", () => {
    const retail = join(examples, "starters/retail");
    const files = generatedFiles(openProject(retail, new Map()), "dev");
    if (!Array.isArray(files)) throw new Error(files.problems);
    const orders = files.find((file) => file.path === "build/dev/src/retail/bronze/orders.sql");
    expect(orders?.text).toBe(readFileSync(join(retail, orders!.path), "utf8"));
  });

  it("are found for a table, in every pack's folder", () => {
    const erp = join(examples, "starters/private-sql-server");
    const files = generatedFiles(openProject(erp, new Map()), "dev");
    if (!Array.isArray(files)) throw new Error(files.problems);
    expect(generatedForTable(files, "invoices").map((file) => file.path)).toEqual([
      "build/dev/databricks/src/erp/bronze/invoices.sql",
      "build/dev/adf/pipeline/pl_erp_erp.json",
    ]);
  });

  it("say what is wrong when the project has problems", () => {
    const retail = join(examples, "starters/retail");
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
