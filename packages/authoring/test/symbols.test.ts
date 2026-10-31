// The project's named things, for "Go to Symbol in Workspace" and the outline.
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openProject } from "../src/project.js";
import { projectSymbols } from "../src/symbols.js";

const retail = join(import.meta.dirname, "../../../samples/starters/retail");

describe("projectSymbols", () => {
  const symbols = projectSymbols(openProject(retail, new Map()));
  const named = (name: string) => symbols.filter((item) => item.name === name);

  it("lists tables, documents and values once each, where they are defined", () => {
    expect(named("orders")).toMatchObject([{ kind: "table", file: "flows/shop.yaml" }]);
    expect(
      named("shop")
        .map((item) => item.kind)
        .sort(),
    ).toEqual(["Connection", "Flow"]);
    expect(named("host")).toMatchObject([{ kind: "value", file: "project.yaml" }]);
  });

  it("names a transform once, as a transform, though it also defines a table", () => {
    expect(named("daily_sales")).toMatchObject([
      { kind: "Transform", file: "transforms/daily_sales.yaml" },
    ]);
  });

  it("leaves out generated files", () => {
    expect(symbols.some((item) => item.file.startsWith("build/"))).toBe(false);
  });
});
