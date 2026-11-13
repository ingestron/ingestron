// Which metadata completion reads: a connection's document as the definitions choose it, the
// first the project's imports load, and the text completion was asked for, not an earlier one at
// the same place, on the project of source-project.ts.
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { completionsAt } from "../src/assist/completion.js";
import { openProject } from "../src/project/project.js";
import { at, files, useSourceProject } from "./source-project.js";

let folder = "";
useSourceProject((created) => (folder = created));

const entry = (object: string) =>
  [
    `  - object: ${object}`,
    "    captured: { at: 2026-11-12T09:30:00Z, from: catalog, file: sources/erp.catalog.csv }",
    "    columns:",
    "      - { name: id, sourceType: int, logicalType: integer, required: true }",
  ].join("\n");
const metadata = (id: string, object: string) =>
  `apiVersion: ingestron.io/v1\nkind: SourceMetadata\nid: ${id}\nconnection: erp\nnames: { parts: 3, caseSensitive: false }\ntables:\n${entry(object)}\n`;

describe("the metadata document completion reads", () => {
  it("is one the project loads, as the definitions choose, not a file it does not import", () => {
    const items = at(
      "flows/erp.yaml",
      (text) => text.replace("object: ERP.dbo.Customers", "object: |"),
      {
        // Listed first of the project's files, but no import loads it.
        "archive/erp.yaml": metadata("archived", "ERP.dbo.Archived"),
        "sources/erp.yaml": metadata("erp", "ERP.dbo.Loaded"),
      },
    );
    expect(items.map((item) => item.label)).toEqual(["ERP.dbo.Loaded"]);
  });

  it("is the first the project loads when two are for the connection", () => {
    const items = at(
      "flows/erp.yaml",
      (text) => text.replace("object: ERP.dbo.Customers", "object: |"),
      {
        "sources/erp.yaml": metadata("erp", "ERP.dbo.First"),
        "sources/erp2.yaml": metadata("erp2", "ERP.dbo.Second"),
      },
    );
    expect(items.map((item) => item.label)).toEqual(["ERP.dbo.First"]);
  });
});

describe("the text completion is asked for", () => {
  it("is the one read, though an earlier text had the cursor at the same offset", () => {
    // The flow's source is written last, after the cursor, so the two texts differ only there.
    const flow = files["flows/erp.yaml"]!.replace("source: erp\n", "").replace(
      "check: Email IS NOT NULL",
      "check: ",
    );
    const offset = flow.indexOf("check: ") + "check: ".length;
    const project = openProject(folder, new Map([[join(folder, "flows/erp.yaml"), flow]]));
    const labels = (text: string) =>
      completionsAt(project, "flows/erp.yaml", text, offset, "dev").map((item) => item.label);
    expect(labels(`${flow}source: nowhere\n`)).toEqual([]);
    expect(labels(`${flow}source: erp\n`)).toEqual(["CustomerID", "Email"]);
  });

  it("is the one read, though an earlier text of the same length had the cursor at the same offset", () => {
    const flow = files["flows/erp.yaml"]!.replace("source: erp\n", "").replace(
      "check: Email IS NOT NULL",
      "check: ",
    );
    const offset = flow.indexOf("check: ") + "check: ".length;
    const project = openProject(folder, new Map([[join(folder, "flows/erp.yaml"), flow]]));
    const labels = (text: string) =>
      completionsAt(project, "flows/erp.yaml", text, offset, "dev").map((item) => item.label);
    // The same number of characters: only the source's name differs.
    expect(labels(`${flow}source: err\n`)).toEqual([]);
    expect(labels(`${flow}source: erp\n`)).toEqual(["CustomerID", "Email"]);
  });
});

describe("the placeholder project", () => {
  it("gives the typed text's size, not the file's on disk", () => {
    // A size left over from the file on disk is over the limit; the text being typed is not.
    const flow = files["flows/erp.yaml"]!.replace("check: Email IS NOT NULL", "check: ");
    const offset = flow.indexOf("check: ") + "check: ".length;
    const project = openProject(folder, new Map([[join(folder, "flows/erp.yaml"), flow]]));
    const files_ = {
      ...project.files,
      size: (path: string) => (path === "flows/erp.yaml" ? 50_000_000 : project.files.size?.(path)),
    };
    const stale = { ...project, files: files_ };
    const labels = completionsAt(stale, "flows/erp.yaml", flow, offset, "dev").map(
      (item) => item.label,
    );
    expect(labels).toEqual(["CustomerID", "Email"]);
  });
});
