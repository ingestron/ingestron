// A project made from a recipe holds the contracts its flows and transforms use, and no others.
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { projectRecipe } from "../src/index.js";

interface Definition {
  kind?: string;
  id?: string;
  tables?: Record<string, { contract?: string }>;
  contract?: string;
}

function contractsOf(files: Record<string, unknown>) {
  const definitions = Object.entries(files)
    .filter(([path]) => /\.ya?ml$/.test(path))
    .map(([path, text]) => ({ path, value: parse(String(text)) as Definition }));
  const written = definitions
    .filter(({ value }) => value?.kind === "DataContract")
    .map(({ value }) => value.id);
  const used = [
    ...definitions
      .filter(({ value }) => value?.kind === "Flow")
      .flatMap(({ value }) => Object.values(value.tables ?? {}).map((table) => table.contract)),
    ...definitions
      .filter(({ value }) => value?.kind === "Transform")
      .map(({ value }) => value.contract),
  ];
  return { written: [...new Set(written)].sort(), used: [...new Set(used)].sort() };
}

describe("contracts in a project made from a recipe", () => {
  it.each([
    ["postgresql", "adf-databricks", "private"],
    ["sqlserver", "adf-synapse", "private"],
    ["mysql", "adf-duckdb", "public"],
    ["azure-blob", "adf-landing", "public"],
    ["salesforce", "adf-databricks", "public"],
    ["sqlserver", "databricks", "public"],
  ])(
    "%s via %s writes exactly the contracts its flows and transforms use",
    (connector, via, connectivity) => {
      const { written, used } = contractsOf(projectRecipe(connector, via, connectivity).files);
      expect(used.length).toBeGreaterThan(0);
      expect(written).toEqual(used);
    },
  );
});
