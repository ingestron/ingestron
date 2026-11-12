// The source request, importing a file and the recipe problems, as ProjectSnapshot methods
// (spec/cli/sources.md, sections 1, 3, 4 and 6), on a copy of the request conformance project.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProjectSnapshot } from "../src/index.js";

const conformance = join(import.meta.dirname, "../../../spec/cli/conformance/sources/request");
const at = "2026-11-12T09:00:00Z";
const catalog = Buffer.from(
  [
    "table_catalog,table_schema,table_name,column_name,ordinal_position,data_type,is_nullable,primary_key_position",
    "ERP,sales,orders,id,1,int,NO,1",
    "ERP,sales,orders,placed,2,datetime,YES,",
    "",
  ].join("\n"),
);

let folder = "";
beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), "source-snapshot-"));
  cpSync(conformance, folder, { recursive: true });
});
afterAll(() => rmSync(folder, { recursive: true, force: true }));

const expected = (name: string) => readFileSync(join(conformance, name), "utf8");

describe("ProjectSnapshot.sourceRequest", () => {
  it("is the conformance request for the environment", () => {
    expect(ProjectSnapshot.open(folder).sourceRequest("dev")).toBe(expected("request.dev.md"));
  });

  it("asks for one connection", () => {
    expect(ProjectSnapshot.open(folder).sourceRequest("prod", "erp")).toBe(
      expected("request.prod.erp.md"),
    );
  });
});

describe("ProjectSnapshot.sourceFileAt", () => {
  it("names the connection and object a file under sources/ belongs to", () => {
    const snapshot = ProjectSnapshot.open(folder);
    expect(snapshot.sourceFileAt("sources/erp.catalog.csv")).toEqual({ connection: "erp" });
    expect(snapshot.sourceFileAt("sources/landing/exports/orders.csv")).toEqual({
      connection: "landing",
      object: "exports/orders",
    });
  });

  it("is undefined for a metadata document and a file outside sources/", () => {
    const snapshot = ProjectSnapshot.open(folder);
    expect(snapshot.sourceFileAt("sources/erp.yaml")).toBeUndefined();
    expect(snapshot.sourceFileAt("flows/x.yaml")).toBeUndefined();
  });
});

describe("ProjectSnapshot.importSource", () => {
  it("gives the document and project.yaml with its imports line, and the summary", () => {
    const edit = ProjectSnapshot.open(folder).importSource("sources/erp.catalog.csv", catalog, {
      at,
    });
    if ("refused" in edit) throw new Error(edit.refused.join("\n"));
    expect(edit.files.map(({ file }) => file)).toEqual(["sources/erp.yaml", "project.yaml"]);
    expect(edit.files[0]!.text).toContain("kind: SourceMetadata");
    expect(edit.files[0]!.text).toContain("orders");
    const project = readFileSync(join(folder, "project.yaml"), "utf8");
    expect(edit.files[1]!.text).toBe(
      `${project}${project.endsWith("\n") ? "" : "\n"}  - sources/erp.yaml\n`,
    );
    expect(edit.summary).toMatch(/^sources\/erp\.yaml: /);
    expect(edit.breaking).toBe(0);
  });

  it("adds the line to project.yaml as an open editor holds it, unsaved edits kept", () => {
    const disk = readFileSync(join(folder, "project.yaml"), "utf8");
    const open = `# typed, not saved\n${disk}`;
    const snapshot = ProjectSnapshot.open(folder, new Map([[join(folder, "project.yaml"), open]]));
    const edit = snapshot.importSource("sources/erp.catalog.csv", catalog, { at });
    if ("refused" in edit) throw new Error(edit.refused.join("\n"));
    const text = edit.files.find(({ file }) => file === "project.yaml")!.text;
    expect(text.startsWith("# typed, not saved\n")).toBe(true);
    expect(text).toBe(`${open}${open.endsWith("\n") ? "" : "\n"}  - sources/erp.yaml\n`);
  });

  it("takes the connection from the option when the path does not name it", () => {
    const edit = ProjectSnapshot.open(folder).importSource("/elsewhere/export.csv", catalog, {
      connection: "erp",
      at,
    });
    expect("refused" in edit).toBe(false);
  });

  it("refuses a file that names no connection, writing nothing", () => {
    const edit = ProjectSnapshot.open(folder).importSource("/elsewhere/export.csv", catalog, {
      at,
    });
    expect(edit).toEqual({ refused: ["Name the connection this file describes."] });
  });

  it("refuses a file the reader cannot read, with its reasons and no files", () => {
    const edit = ProjectSnapshot.open(folder).importSource(
      "sources/erp.catalog.csv",
      Buffer.from("nothing,useful\n"),
      { at },
    );
    expect("files" in edit).toBe(false);
    expect("refused" in edit && edit.refused.length).toBeGreaterThan(0);
  });
});

describe("recipe problems", () => {
  const withMetadata = (metadata: string) => {
    const copy = mkdtempSync(join(tmpdir(), "source-recipes-"));
    cpSync(conformance, copy, { recursive: true });
    const path = join(copy, "connections/erp.yaml");
    const text = readFileSync(path, "utf8").replace(/metadata:[\s\S]*$/, metadata);
    writeFileSync(path, text);
    return { copy, text };
  };

  it("reports an unknown metadata.from at its line", () => {
    const { copy, text } = withMetadata("metadata:\n  from: nope\n");
    try {
      const found = ProjectSnapshot.open(copy)
        .problems("dev")
        .filter(({ code }) => code === "SOURCE_RECIPE_UNKNOWN");
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({
        file: "connections/erp.yaml",
        severity: "error",
        message: expect.stringMatching(
          /^The connection "erp" names the recipe "nope", which does not exist\. Recipes: .*salesforce.*\.$/,
        ),
      });
      const line = text.split("\n").findIndex((row) => row.includes("from: nope"));
      expect(found[0]!.range.start).toEqual({ line, character: "  from: ".length });
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });

  it("reports an input the recipe takes none for, at the key", () => {
    const { copy, text } = withMetadata(
      "metadata:\n  from: sqlserver\n  with:\n    database: ERP\n    colour: blue\n",
    );
    try {
      const found = ProjectSnapshot.open(copy)
        .problems("dev")
        .filter(({ code }) => code === "SOURCE_RECIPE_INPUT");
      expect(found).toHaveLength(1);
      expect(found[0]!.message).toBe(
        'The recipe "sqlserver" takes no input "colour". Its inputs: database.',
      );
      const line = text.split("\n").findIndex((row) => row.includes("colour: blue"));
      expect(found[0]!.range.start).toEqual({ line, character: "    ".length });
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });

  it("reports nothing for the conformance project", () => {
    const codes = ProjectSnapshot.open(folder)
      .problems("dev")
      .map(({ code }) => code);
    expect(codes).not.toContain("SOURCE_RECIPE_UNKNOWN");
    expect(codes).not.toContain("SOURCE_RECIPE_INPUT");
  });
});
