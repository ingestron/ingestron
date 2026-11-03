// What the passport claims about a table, decided per table (spec/cli/passport.md).
import { describe, expect, it } from "vitest";
import { passports } from "../src/passport.js";
import { model, project } from "./passport-fixtures.js";

describe("passport claims", () => {
  it("claims Unity Catalog tags only for a table the Databricks pack stores", () => {
    const resolved = model(project());
    resolved.platform.manage.tags = true;
    const customers = resolved.tables.find((item) => item.name === "customers")!;
    const stored = passports(resolved)["customers.md"]!;
    expect(stored).toMatch(/\| email \|.*confidential \(sensitive\), tagged in Unity Catalog/);
    customers.store = { ...customers.store!, pack: "duckdb" };
    const elsewhere = passports(resolved)["customers.md"]!;
    expect(elsewhere).toMatch(/\| email \|.*confidential \(sensitive\) \|/);
    expect(elsewhere).not.toContain("Unity Catalog");
  });
});
