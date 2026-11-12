// Drafting contracts: how it resolves, and the round trip that proves a draft is a contract.
import { resolveDefinitions } from "@ingestron/definitions";
import { describe, expect, it } from "vitest";
import { draftContracts, packs } from "../src/index.js";
import { resolving } from "../src/request/index.js";
import { flowWithContract, host, project } from "./source-draft-fixture.js";

describe("draftContracts: resolving", () => {
  it("drafts although CONTRACT_NEEDED and TABLE_NO_COLUMNS leave no model", () => {
    const { diagnostics, model, sourceTables } = resolveDefinitions(project(), {
      ...resolving,
      sourceTables: true,
      packs: [...packs],
      ...host,
    });
    expect(model).toBeUndefined();
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain("CONTRACT_NEEDED");
    expect(sourceTables).toBeDefined();
    expect(draftContracts(project(), { ...host, needed: true }).drafts).toHaveLength(1);
  });

  it("without an environment, resolves for the first one project.yaml declares, whose values it needs", () => {
    const named = draftContracts(project(), { ...host, tables: ["sales.orders"] });
    const result = draftContracts(project(), { envvars: {}, tables: ["sales.orders"] });
    expect(result.problems).toEqual([]);
    expect(result).toEqual(named);
  });

  it("stops at an error the metadata does not settle, written as plan writes it", () => {
    const broken = project({ "flows/landing.yaml": "kind: Flow\nid: landing\nsource: nowhere\n" });
    const result = draftContracts(broken, { ...host, tables: ["sales.orders"] });
    expect(result.drafts).toEqual([]);
    expect(result.problems.length).toBeGreaterThan(0);
    expect(result.problems.join("\n")).toMatch(/\.yaml:\d+:\d+ {2}error {2}[A-Z_]+/);
  });

  it("drafts nothing and reports nothing when every table that needs a contract has one", () => {
    const { drafts } = draftContracts(project(), { ...host, tables: ["sales.orders"] });
    const done = project({
      "flows/sales.yaml": flowWithContract,
      "contracts/erp.orders.yaml": drafts[0]!.text,
    });
    expect(draftContracts(done, { ...host, needed: true })).toEqual({ drafts: [], problems: [] });
  });
});

describe("draftContracts: the round trip", () => {
  const table = (files: ReturnType<typeof project>) => {
    const result = resolveDefinitions(files, {
      ...resolving,
      sourceTables: true,
      packs: [...packs],
      ...host,
    });
    return { ...result, orders: result.model?.tables.find((item) => item.name === "orders") };
  };

  it("a draft is loaded by the project's contracts/*.yaml, named by its id, and settles the table", () => {
    const { drafts } = draftContracts(project(), { ...host, tables: ["sales.orders"] });
    const { id, path, text } = drafts[0]!;
    expect(`${id}`).toBe("erp.orders");
    const named = table(project({ "flows/sales.yaml": flowWithContract, [path]: text }));
    const codes = named.diagnostics.map((diagnostic) => diagnostic.code);
    expect(named.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    expect(codes).not.toContain("CONTRACT_NEEDED");
    expect(codes).not.toContain("TABLE_NO_COLUMNS");
    expect(codes.filter((code) => code.startsWith("SOURCE_"))).toEqual([]);
    expect(named.orders?.contract.id).toBe("erp.orders");
  });

  it("the table has the columns, types and key the metadata has", () => {
    const { drafts } = draftContracts(project(), { ...host, tables: ["sales.orders"] });
    const { path, text } = drafts[0]!;
    const drafted = table(project({ "flows/sales.yaml": flowWithContract, [path]: text }));
    // The same table kept in a layer that needs no contract takes its columns from the metadata.
    const observed = table(
      project({
        "flows/sales.yaml": flowWithContract
          .replace(/, contract: erp.orders/, "")
          .replace("layer: silver", "layer: bronze"),
      }),
    );
    expect(observed.orders?.contract.origin).toBe("metadata");
    const shape = (item: typeof drafted.orders) =>
      item!.contract.columns.map(({ name, type, logicalType }) => ({ name, type, logicalType }));
    expect(shape(drafted.orders)).toEqual(shape(observed.orders));
    expect(drafted.orders!.contract.primaryKey).toEqual(["OrderID", "Region"]);
    expect(drafted.orders!.contract.primaryKey).toEqual(observed.orders!.contract.primaryKey);
  });
});
