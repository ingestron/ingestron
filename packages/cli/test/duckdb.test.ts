// DuckDB projects: the starter runs end to end on a laptop, and a cloud
// project runs its tables locally from a load's files with runs-on: duckdb.
import { cpSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { describe, expect, it } from "vitest";
import { run } from "../src/index.js";

function session(cwd: string) {
  let output = "";
  const io = { cwd, write: (text: string) => (output += text) };
  return (...args: string[]) => {
    output = "";
    const code = run(args, io);
    return { code, output };
  };
}

/**
 * Runs SQL from `folder`, as the DuckDB command line would there, and returns
 * the rows of `query`. The database is closed each time, so a second call sees
 * only what the first wrote. process.chdir needs vitest's default forks pool.
 */
async function inFolder(folder: string, sql: string, query: string) {
  const previous = process.cwd();
  process.chdir(folder);
  const instance = await DuckDBInstance.create("ingestron.duckdb");
  try {
    const connection = await instance.connect();
    try {
      if (sql) await connection.run(sql);
      return (await connection.runAndReadAll(query)).getRowObjectsJson();
    } finally {
      connection.closeSync();
    }
  } finally {
    instance.closeSync();
    process.chdir(previous);
  }
}

describe("the duckdb starter", () => {
  it("loads the sample orders, runs the transform and publishes both tables", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "ingestron-duckdb-"));
    const ingestron = session(cwd);
    const created = ingestron("init", "demo", "--template", "duckdb", "--yes");
    expect(created.code, created.output).toBe(0);
    const applied = ingestron("apply", "--no-diff", "--definitions", "demo", "--out", "demo/build");
    expect(applied.code, applied.output).toBe(0);
    const project = join(cwd, "demo");
    const sql = readFileSync(join(project, "build/dev/run.sql"), "utf8");
    const totals = "SELECT customer, orders, total FROM silver.customer_totals ORDER BY customer";
    const expected = [
      { customer: "Aroha", orders: "2", total: 65.75 },
      { customer: "Ben", orders: "2", total: 42 },
      { customer: "Chen", orders: "1", total: 8.75 },
    ];
    expect(await inFolder(project, sql, totals)).toEqual(expected);
    expect(await inFolder(project, sql, totals)).toEqual(expected);
    const published =
      "SELECT count(*) AS n FROM read_parquet('published/silver.customer_totals.parquet')";
    expect(await inFolder(project, "", published)).toEqual([{ n: "3" }]);
  });
});

describe("the duckdb-local fixture", () => {
  const fixture = join(import.meta.dirname, "fixtures/duckdb-local");

  it("lands with ADF in dev, and reads a load's files from ./samples in local", async () => {
    const project = mkdtempSync(join(tmpdir(), "ingestron-duckdb-local-"));
    cpSync(fixture, project, { recursive: true });
    const ingestron = session(project);
    const applied = ingestron("apply", "--no-diff", "--definitions", ".", "--out", "build");
    expect(applied.code, applied.output).toBe(0);
    const cloud = readFileSync(join(project, "build/dev/duckdb/run.sql"), "utf8");
    expect(cloud).toContain(
      "FROM read_parquet('abfss://landing@salesdev.dfs.core.windows.net/erp/erp.dbo.Invoices/*.parquet',",
    );
    const local = readFileSync(join(project, "build/local/duckdb/run.sql"), "utf8");
    expect(local).toContain("FROM read_parquet('./samples/erp.dbo.Invoices/*.parquet',");
    expect(
      local.replaceAll("./samples/", "<landed>/").replaceAll("./published/", "<published>/"),
    ).toBe(
      cloud
        .replaceAll("abfss://landing@salesdev.dfs.core.windows.net/erp/", "<landed>/")
        .replaceAll("abfss://published@salesdev.dfs.core.windows.net/", "<published>/")
        .replace("(dev)", "(local)"),
    );
    mkdirSync(join(project, "samples/erp.dbo.Invoices"), { recursive: true });
    await inFolder(
      project,
      "COPY (SELECT * FROM (VALUES (1, 10, 25.5), (2, 10, 4.5), (3, 20, 8.0)) t(invoice_id, customer_id, amount)) TO 'samples/erp.dbo.Invoices/load.parquet' (FORMAT parquet);",
      "SELECT 1",
    );
    expect(
      await inFolder(
        project,
        local,
        "SELECT customer_id, total FROM silver.customer_totals ORDER BY 1",
      ),
    ).toEqual([
      { customer_id: "10", total: 30 },
      { customer_id: "20", total: 8 },
    ]);
  });
});
