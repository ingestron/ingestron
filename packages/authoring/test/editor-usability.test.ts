// Editor actions over imported metadata, without replacing the authoring implementation.
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ProjectSnapshot } from "../src/index.js";
import { at, files, useSourceProject } from "./source-project.js";

let folder = "";
useSourceProject((created) => {
  folder = created;
});
const open = (changes: Record<string, string> = {}) =>
  ProjectSnapshot.open(
    folder,
    new Map(Object.entries(changes).map(([name, text]) => [join(folder, name), text])),
  );
const oneFlow =
  "apiVersion: ingestron.io/v1\nkind: Flow\nid: erp\nsource: erp\ntables:\n  customers:\n    object: ERP.dbo.Customers\n";

describe("usable field completion", () => {
  it("inserts the delimiter for metadata input keys", () => {
    const found = at("connections/erp.yaml", (text) => text.replace("    tenant: north", "    |"));
    expect(found.find((item) => item.label === "tenant")).toMatchObject({
      insertText: "tenant: ",
      retrigger: true,
    });
  });
  it("inserts the delimiter for a contract property key", () => {
    const found = at("contracts/orders.yaml", (text) =>
      text.replace("        logicalType: integer", "        |"),
    );
    expect(found.find((item) => item.label === "physicalType")).toMatchObject({
      insertText: "physicalType: ",
    });
  });
  it("does not duplicate an existing key's delimiter", () => {
    const found = at("contracts/orders.yaml", (text) =>
      text.replace("logicalType: integer", "physicalTy|pe: integer"),
    );
    expect(found.find((item) => item.label === "physicalType")?.insertText).toBeUndefined();
  });
});

describe("an imported object", () => {
  it("opens the complete spaced object in its metadata document", () => {
    const flow = files["flows/erp.yaml"]!.replaceAll("ERP.dbo.Customers", "ERP.dbo.Order Details");
    const metadata = files["sources/erp.yaml"]!.replaceAll(
      "ERP.dbo.Customers",
      "ERP.dbo.Order Details",
    );
    const project = open({ "flows/erp.yaml": flow, "sources/erp.yaml": metadata });
    const target = project.definitionAt("flows/erp.yaml", flow.indexOf("Details") + 2);
    expect(target?.file).toBe("sources/erp.yaml");
    expect(metadata.slice(...target!.range)).toBe("ERP.dbo.Order Details");
  });
  it("shows known columns and provenance in Reference", () => {
    const flow = files["flows/erp.yaml"]!;
    const entry = open().referenceAt(
      "flows/erp.yaml",
      flow,
      flow.indexOf("ERP.dbo.Customers") + 5,
      "dev",
    );
    expect(entry?.text).toContain("CustomerID");
    expect(entry?.text).toContain("2026-11-12");
  });
  it("distinguishes a misspelt object and supplies a replacement fix", () => {
    const flow = oneFlow.replace("ERP.dbo.Customers", "ERP.dbo.Custmers");
    const project = open({ "flows/erp.yaml": flow });
    const problem = project
      .problems("dev")
      .find((item) => item.code === "TABLE_NO_COLUMNS" && item.message.includes("Custmers"));
    expect(problem?.message).toContain("imported metadata");
    expect(problem?.fixes?.[0]).toMatchObject({
      edits: [{ pointer: "/tables/customers/object", set: "ERP.dbo.Customers" }],
    });
  });
  it("reports the effective mode of an additional review environment", () => {
    const project = open({
      "flows/erp.yaml": oneFlow,
      "project.yaml": files["project.yaml"]!.replace("  dev: {}", "  dev: {}\n  review: {}"),
    });
    expect(project.environmentMode("dev")).toBe("development");
    expect(project.environmentMode("review")).toBe("production");
  });
});
