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

  it("says in every section that an output is not built here, beside one that is", () => {
    const resolved = model(project());
    const product = resolved.products.find((item) => item.id === "sales")!;
    product.outputs.push({ name: "returns", contract: "shop.returns", tables: [] });
    const page = passports(resolved)["sales.md"]!;
    const section = (title: string) =>
      page
        .split("\n## ")
        .find((item) => item.startsWith(title))!
        .trim();
    const note = "`returns`: Not built in this environment.";
    expect(section("Quality")).toContain("### returns\n\nNot built in this environment.");
    expect(section("Quality")).toContain("### daily_sales");
    expect(section("Who may use it")).toContain(note);
    expect(section("Lineage")).toContain(note);
    expect(section("Lineage")).toContain("```mermaid");
  });

  it("gives the plain sentence for an output when nothing is built here", () => {
    const resolved = model(project());
    const product = resolved.products.find((item) => item.id === "sales")!;
    product.outputs[0]!.tables = [];
    const page = passports(resolved)["sales.md"]!;
    const section = (title: string) =>
      page
        .split("\n## ")
        .find((item) => item.startsWith(title))!
        .trim();
    expect(section("Quality")).toContain("### daily_sales\n\nNot built in this environment.");
    expect(section("Who may use it")).toContain("`daily_sales`: Not built in this environment.");
    expect(section("Who may use it")).not.toContain("name no roles");
    expect(section("Lineage")).toBe("Lineage\n\nNot built in this environment.");
  });
});
