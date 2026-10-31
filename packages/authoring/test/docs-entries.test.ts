// A docs link the editor shows opens in the Reference panel itself, for
// everything the code describes; other pages stay on the site.
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { referenceForDocs } from "../src/docs-entries.js";
import { openProject } from "../src/project.js";

const project = openProject(
  join(import.meta.dirname, "../../../samples/starters/private-sql-server"),
  new Map(),
);
const open = (path: string) => referenceForDocs(project, path, "dev");

describe("referenceForDocs", () => {
  it("opens a document kind with its fields", () => {
    expect(open("/docs/reference/documents#transform")).toMatchObject({
      title: "Transform",
      subtitle: "Document",
    });
  });

  it("opens a field, with the fields under it to go further", () => {
    const entry = open("/docs/reference/documents#flow-tables-item-ingest");
    expect(entry).toMatchObject({ title: "ingest", subtitle: "Field of Flow" });
    expect(entry?.fields?.map((field) => field.name)).toContain("with");
  });

  it("opens a method and one of its settings", () => {
    expect(open("/docs/reference/packs/adf#adf-copy")).toMatchObject({ title: "adf-copy" });
    expect(open("/docs/reference/packs/adf#adf-copy-landing")).toMatchObject({
      title: "landing",
      subtitle: "Setting of adf-copy",
    });
  });

  it("opens a problem code and a connector", () => {
    expect(open("/docs/reference/errors#CAPABILITY_OFF")).toMatchObject({
      title: "CAPABILITY_OFF",
      subtitle: "Problem code",
    });
    expect(open("/docs/connectors/sqlserver")).toMatchObject({ title: "SQL Server" });
  });

  it("leaves other pages to the site", () => {
    expect(open("/docs/concepts/definitions")).toBeUndefined();
  });
});
