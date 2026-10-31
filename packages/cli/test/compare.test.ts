// ingestron compare: what differs between two environments, after resolving.
import { join } from "node:path";
import { nodeFiles } from "@ingestron/config";
import { describe, expect, it } from "vitest";
import { compareEnvironments } from "../src/compare.js";
import { run } from "../src/index.js";

const retail = join(import.meta.dirname, "../project-templates/retail");

describe("compareEnvironments", () => {
  const text = compareEnvironments(nodeFiles(retail), "dev", "prod");

  it("lists each difference with both values, grouped", () => {
    expect(text).toMatch(/^# dev ↔ prod: retail\n/);
    expect(text).toContain("## Platform");
    expect(text).toContain("- `mode`: `development` → `production`");
    expect(text).toContain(
      "- `workspace.host`: `https://adb-1111111111111111.1.azuredatabricks.net` → `https://adb-2222222222222222.2.azuredatabricks.net`",
    );
    expect(text).toContain("## Table orders");
    expect(text).toContain("- `full name`: `dev_sales.bronze.orders` → `prod_sales.bronze.orders`");
    expect(text).toContain("- `ingest.connection.settings.path`:");
  });

  it("leaves out what is the same", () => {
    expect(text).not.toContain("`run_as");
    expect(text).not.toContain("ingest.method");
  });

  it("runs as ingestron compare, the first two environments by default", () => {
    let output = "";
    const code = run(["compare"], { cwd: retail, write: (chunk) => (output += chunk) });
    expect(code).toBe(0);
    expect(output).toBe(text);
  });
});

describe("compareEnvironments for tables that end at the landed files", () => {
  it("compares where the files land, not a table that is never created", () => {
    const landing = join(import.meta.dirname, "fixtures/landing-only");
    const text = compareEnvironments(nodeFiles(landing), "dev", "prod");
    expect(text).not.toContain("full name");
    expect(text).toContain(
      "- `lands at`: `abfss://landing@saleslakedev.dfs.core.windows.net/erp/erp.dbo.Customers/erp.dbo.Customers.parquet` → `abfss://landing@saleslakeprod.dfs.core.windows.net/erp/erp.dbo.Customers/erp.dbo.Customers.parquet`",
    );
  });
});
