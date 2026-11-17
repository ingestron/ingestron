// Metadata to contract to SQL: drafting and linking a contract changes no generated column type
// (spec/cli/sources.md, section 5; definitions specification, section 12.7).
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { run } from "../src/index.js";

const folders: string[] = [];
afterAll(() => folders.forEach((folder) => rmSync(folder, { recursive: true, force: true })));

const catalog = [
  "table_catalog,table_schema,table_name,column_name,ordinal_position,data_type,is_nullable,primary_key_position",
  "Northwind,dbo,Orders,OrderID,1,int,NO,1",
  "Northwind,dbo,Orders,Freight,2,money,YES,",
  "Northwind,dbo,Orders,Discount,3,smallmoney,YES,",
  'Northwind,dbo,Orders,Total,4,"decimal(18,2)",YES,',
  "Northwind,dbo,Orders,Rate,5,float,YES,",
].join("\n");

function project() {
  const cwd = mkdtempSync(join(tmpdir(), "contract-precision-"));
  folders.push(cwd);
  let output = "";
  const ok = (...args: string[]) => {
    output = "";
    expect(run(args, { cwd, write: (text) => void (output += text) }), output).toBe(0);
    return output;
  };
  const read = (file: string) => readFileSync(join(cwd, file), "utf8");
  return { cwd, ok, read };
}

it("keeps money and decimal precision when a drafted contract is linked on Synapse", () => {
  const { cwd, ok, read } = project();
  ok("init", ".", "--platform", "synapse", "--yes");
  ok(
    "connection",
    "add",
    "northwind",
    "--connector",
    "azure-sql-database",
    "--connectivity",
    "public",
  );
  writeFileSync(join(cwd, "catalog.csv"), `${catalog}\n`);
  ok("source", "import", "northwind", "catalog.csv");
  ok("flow", "add", "sales", "--connection", "northwind", "--object", "Northwind.dbo.Orders");
  ok("apply");
  const before = read("build/synapse/views.sql");
  expect(before).toContain("[Freight] DECIMAL(19,4)");
  expect(before).toContain("[Discount] DECIMAL(10,4)");
  expect(before).toContain("[Total] DECIMAL(18,2)");

  ok("contract", "--from-metadata", "sales.orders");
  const contract = read("contracts/northwind.orders.yaml");
  expect(contract).toContain(
    "      - name: Freight\n        logicalType: number\n        physicalType: DECIMAL(19,4)\n        required: false\n",
  );
  expect(contract).toContain("physicalType: DECIMAL(10,4)");
  expect(contract).toContain("physicalType: DECIMAL(18,2)");
  // A plain float keeps the logical type's own type, so it needs no physicalType.
  expect(contract).toMatch(/- name: Rate\n {8}logicalType: number\n {8}required: false\n/);

  const flow = read("flows/sales.yaml");
  writeFileSync(
    join(cwd, "flows/sales.yaml"),
    flow.replace(
      "object: Northwind.dbo.Orders",
      "object: Northwind.dbo.Orders\n    contract: northwind.orders",
    ),
  );
  expect(ok("apply")).toContain("Up to date.");
  expect(read("build/synapse/views.sql")).toBe(before);
});
