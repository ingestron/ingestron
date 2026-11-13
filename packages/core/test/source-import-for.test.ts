// sourceImportFor: `ingestron source import` without the files, on the source request's fixture
// project (spec/cli/sources.md, sections 3 and 6).
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { sourceImportFor, type SourceImportRequest } from "../src/internal.js";
import { expected, folder, project } from "./source-request-fixture.js";

const at = "2026-11-12T09:30:00Z";
const shipments = "ShipmentID,Carrier\n1,ZZ-SECRET-42\n";
const catalog = [
  "table_catalog,table_schema,table_name,column_name,ordinal_position,data_type,is_nullable,primary_key_position",
  "ERP,dbo,Customers,CustomerID,1,int,NO,1",
].join("\n");

/** The import into the fixture project, with no installed recipes and no environment variables. */
const importInto = (files = project(), request: Partial<SourceImportRequest> = {}) =>
  sourceImportFor(files, {
    connection: "landing",
    file: "sources/landing/shipments.csv",
    contents: shipments,
    at,
    recipesRoot: join(folder, "no-such-folder"),
    envvars: {},
    ...request,
  });

/** The `captured.file` and `object` of each table the import wrote. */
function captured(result: ReturnType<typeof importInto>): { object: string; file: string }[] {
  if ("problems" in result) throw new Error(result.problems.join("\n"));
  const document = parse(result.imported.text) as {
    tables: { object: string; captured: { file: string } }[];
  };
  return document.tables.map(({ object, captured }) => ({ object, file: captured.file }));
}

describe("sourceImportFor", () => {
  it("imports into the connection's document and adds it to project.yaml's imports", () => {
    const imports = expected("project.yaml");
    const without = imports.replace("  - sources/landing.yaml\n", "");
    const result = importInto(project({ "sources/landing.yaml": null, "project.yaml": without }));
    if ("problems" in result) throw new Error(result.problems.join("\n"));
    expect(result.document).toBe("sources/landing.yaml");
    expect(result.project).toBe(`${without}  - sources/landing.yaml\n`);
    expect(result.imported.text).not.toContain("ZZ-SECRET-42");
  });

  it("reads the current document from the project, and leaves project.yaml when an import matches", () => {
    const result = importInto();
    if ("problems" in result) throw new Error(result.problems.join("\n"));
    expect(result.project).toBeUndefined();
    expect(captured(result).map(({ object }) => object)).toEqual(["returns", "shipments"]);
  });

  it("loads for the first environment project.yaml declares when none is given, and records none", () => {
    // erp's metadata.with and objects hold values only the environments give.
    const result = importInto(project(), {
      connection: "erp",
      file: "sources/erp.catalog.csv",
      contents: catalog,
    });
    if ("problems" in result) throw new Error(result.problems.join("\n"));
    expect(parse(result.imported.text)).not.toHaveProperty("environment");
    const given = importInto(project(), {
      connection: "erp",
      file: "sources/erp.catalog.csv",
      contents: catalog,
      environment: "prod",
    });
    if ("problems" in given) throw new Error(given.problems.join("\n"));
    expect(parse(given.imported.text)).toHaveProperty("environment", "prod");
  });

  it.each([
    ["sources\\landing\\shipments.csv", "shipments", "sources/landing/shipments.csv"],
    ["..\\Downloads\\shipments.csv", "loads", "shipments.csv"],
    ["C:\\Users\\me\\Downloads\\shipments.csv", "loads", "shipments.csv"],
    ["../Downloads/shipments.csv", "loads", "shipments.csv"],
    ["/home/me/shipments.csv", "loads", "shipments.csv"],
  ])("records %s as the file %s names, at %s", (file, object, recorded) => {
    const result = importInto(project({ "sources/landing.yaml": null }), { file, object: "loads" });
    expect(captured(result)).toEqual([{ object, file: recorded }]);
  });

  it("names a file by its whole path when only that is an object the connection's flows read", () => {
    // The flow reads orders.csv, Refunds.CSV, returns and exports.v2 (spec/cli/sources.md, section 3).
    const flows = { "flows/landing.yaml": expected("variants/landing-flow.yaml") };
    const objectOf = (file: string, changes: Record<string, string> = {}) =>
      captured(
        importInto(project({ "sources/landing.yaml": null, ...flows, ...changes }), { file }),
      );
    expect(objectOf("sources/landing/orders.csv")).toEqual([
      { object: "orders.csv", file: "sources/landing/orders.csv" },
    ]);
    expect(objectOf("sources/landing/Refunds.CSV")).toEqual([
      { object: "Refunds.CSV", file: "sources/landing/Refunds.CSV" },
    ]);
    expect(objectOf("sources/landing/returns.csv")).toEqual([
      { object: "returns", file: "sources/landing/returns.csv" },
    ]);
    expect(objectOf("sources/landing/exports.v2.csv")).toEqual([
      { object: "exports.v2", file: "sources/landing/exports.v2.csv" },
    ]);
    // A flow that reads orders keeps the path without its extension.
    const orders = expected("variants/landing-flow.yaml").replace(
      "object: returns",
      "object: orders",
    );
    expect(objectOf("sources/landing/orders.csv", { "flows/landing.yaml": orders })).toEqual([
      { object: "orders", file: "sources/landing/orders.csv" },
    ]);
  });

  it("stops for a connection the project lacks, naming its connections", () => {
    expect(importInto(project(), { connection: "nope" })).toEqual({
      problems: ['"nope" is not a connection of the project. Connections: crm, erp, landing.'],
    });
  });

  it("stops for a recipe the connection names that is not there, and for a broken recipe", () => {
    const missing = project({
      "connections/erp.yaml": expected("connections/erp.yaml").replace(
        "from: sqlserver",
        "from: nothere",
      ),
    });
    const result = importInto(missing, { connection: "erp", file: "sources/erp.catalog.csv" });
    expect(result).toHaveProperty("problems");
    expect((result as { problems: string[] }).problems[0]).toMatch(
      /^The connection "erp" names the recipe "nothere", which does not exist\. Recipes:/,
    );
    const broken = importInto(project({ "recipes/sample.yaml": "id: sample\ntitle: [\n" }));
    expect(broken).toHaveProperty("problems");
  });

  it("stops on definitions that cannot be loaded, written as plan writes them", () => {
    const result = importInto(project({ "project.yaml": "id: retail\nimports: [\n" }));
    expect(result).toHaveProperty("problems");
    expect((result as { problems: string[] }).problems.join("\n")).toMatch(/project\.yaml:\d+:\d+/);
  });

  it("gives the import's refusal as its problems", () => {
    expect(importInto(project(), { file: "exports/shipments.csv" })).toEqual({
      problems: ["Name the table this file describes with --object."],
    });
  });
});
