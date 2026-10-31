// A draft contract from a sample file: column names and inferred types only.
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { run } from "../src/index.js";
import { contractFromSample } from "../src/sample-contract.js";

const csv = [
  "id,email,total,paid,ordered_on,updated_at,note",
  '1,a@example.com,12.50,true,2026-10-01,2026-10-01T09:00:00Z,"says ""hi"", twice"',
  "2,b@example.com,3,false,2026-10-02,2026-10-02 10:30:00,",
  "",
].join("\n");

describe("contractFromSample", () => {
  it("infers each CSV column's type, and keeps no sample values", () => {
    const text = contractFromSample(csv, "orders.csv", "shop.orders");
    const contract = parse(text);
    expect(contract).toMatchObject({
      apiVersion: "v3.1.0",
      kind: "DataContract",
      id: "shop.orders",
      status: "draft",
      schema: [{ name: "orders", logicalType: "object" }],
    });
    expect(contract.schema[0].properties).toEqual([
      { name: "id", logicalType: "integer" },
      { name: "email", logicalType: "string" },
      { name: "total", logicalType: "number" },
      { name: "paid", logicalType: "boolean" },
      { name: "ordered_on", logicalType: "date" },
      { name: "updated_at", logicalType: "timestamp" },
      { name: "note", logicalType: "string" },
    ]);
    expect(text).not.toContain("example.com");
    expect(text).toMatch(/^# Drafted from orders\.csv \(2 rows\)/);
  });

  it("keeps codes with leading zeros as text, so 00123 does not become 123", () => {
    const contract = parse(
      contractFromSample("customer_code,qty\n00123,0\n00456,10\n", "c.csv", "c"),
    );
    expect(contract.schema[0].properties).toEqual([
      { name: "customer_code", logicalType: "string" },
      { name: "qty", logicalType: "integer" },
    ]);
  });

  it("reads semicolon-separated text and JSON lines", () => {
    const semicolons = parse(contractFromSample("a;b\n1;x\n", "t.csv", "t"));
    expect(semicolons.schema[0].properties).toHaveLength(2);
    const lines = parse(
      contractFromSample(
        '{"id": 1, "tags": ["a"], "address": {"city": "x"}}\n',
        "events.jsonl",
        "events",
      ),
    );
    expect(lines.schema[0].properties).toEqual([
      { name: "id", logicalType: "integer" },
      { name: "tags", logicalType: "array" },
      { name: "address", logicalType: "object" },
    ]);
  });
});

describe("ingestron contract", () => {
  it("writes contracts/<name>.yaml and never overwrites one", () => {
    const folder = mkdtempSync(join(tmpdir(), "ingestron-contract-"));
    writeFileSync(join(folder, "orders.csv"), csv);
    let output = "";
    const io = { cwd: folder, write: (text: string) => (output += text) };
    expect(run(["contract", "orders.csv"], io)).toBe(0);
    expect(existsSync(join(folder, "contracts/orders.yaml"))).toBe(true);
    expect(readFileSync(join(folder, "contracts/orders.yaml"), "utf8")).toContain("id: orders");
    expect(run(["contract", "orders.csv"], io)).toBe(1);
    expect(output).toContain("contracts/orders.yaml already exists");
  });
});
